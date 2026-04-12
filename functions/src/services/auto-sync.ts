import * as admin from 'firebase-admin';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { getAccessTokenForUser, GOOGLE_CLIENT_SECRET } from '../lib/oauth';
import { setupAllWatches } from './watch-manager';
import { syncGmail } from './gmail';
import { syncDrive } from './drive';
import { syncDocs } from './docs';
import { syncCalendar } from './calendar';
import { syncContacts } from './contacts';
import { syncTasks } from './tasks';
import { syncKeep } from './keep';
import { syncChat } from './chat';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Services that require scheduled polling (no push API)
type PolledService = 'contacts' | 'tasks' | 'keep' | 'chat';
const POLLED_SERVICES: PolledService[] = ['contacts', 'tasks', 'keep', 'chat'];

// Minimum seconds between syncs for a given service — prevents rapid-fire
// push notifications from hammering the Google APIs
const DEBOUNCE_SECONDS = 60;

/**
 * Updates sync_meta/status for a single service after a sync completes.
 * The frontend's onSnapshot listener on this document picks up changes
 * in real time — no manual refresh needed.
 */
async function updateSyncMeta(
    uid: string,
    service: string,
    status: 'syncing' | 'done' | 'error',
    itemCount?: number,
    error?: string,
): Promise<void> {
    const db = admin.firestore();
    const update: Record<string, any> = {
        [`${service}.status`]: status,
        [`${service}.error`]: error ?? null,
    };

    if (status === 'done' && itemCount !== undefined) {
        update[`${service}.lastSync`] = new Date().toISOString();
        update[`${service}.itemCount`] = itemCount;
    }

    await db.doc(`users/${uid}/sync_meta/status`).set(update, { merge: true });
}

/**
 * Checks whether a service was synced recently enough that we should skip
 * this push notification (debounce). Returns true if sync should be skipped.
 */
async function shouldDebounce(uid: string, service: string): Promise<boolean> {
    const db = admin.firestore();
    const snap = await db.doc(`users/${uid}/sync_meta/status`).get();
    const data = snap.data();
    const lastSync = data?.[service]?.lastSync;
    if (!lastSync) return false;

    const elapsed = (Date.now() - new Date(lastSync).getTime()) / 1000;
    return elapsed < DEBOUNCE_SECONDS;
}

/**
 * Core sync executor — gets a fresh access token, marks service as syncing,
 * runs the sync function, then marks done or error. Reused by all triggers.
 */
async function executeSyncForUser(
    uid: string,
    service: string,
    syncFn: (accessToken: string, uid: string) => Promise<number>,
): Promise<void> {
    try {
        await updateSyncMeta(uid, service, 'syncing');
        const accessToken = await getAccessTokenForUser(uid);
        const itemCount = await syncFn(accessToken, uid);
        await updateSyncMeta(uid, service, 'done', itemCount);
        logger.info(`Auto-sync complete: ${service}`, { uid, itemCount });
    } catch (err: any) {
        logger.error(`Auto-sync failed: ${service}`, { uid, error: err.message });
        await updateSyncMeta(uid, service, 'error', undefined, err.message);
    }
}

/** Maps service name to its sync function */
function getSyncFn(service: string): ((accessToken: string, uid: string) => Promise<number>) | null {
    switch (service) {
        case 'gmail': return syncGmail;
        case 'drive': return syncDrive;
        case 'docs': return syncDocs;
        case 'calendar': return syncCalendar;
        case 'contacts': return syncContacts;
        case 'tasks': return syncTasks;
        case 'keep': return syncKeep;
        case 'chat': return syncChat;
        default: return null;
    }
}

// ---------------------------------------------------------------------------
// Gmail Push Handler — triggered by Pub/Sub when Gmail sends a notification
// ---------------------------------------------------------------------------

interface GmailPushData {
    emailAddress: string;
    historyId: string;
}

export const onGmailPush = onMessagePublished(
    {
        topic: 'gmail-push',
        // Secret needed because executeSyncForUser → getAccessTokenForUser → refreshAccessTokenServer uses it
        secrets: [GOOGLE_CLIENT_SECRET],
    },
    async (event) => {
        // Gmail push messages contain base64-encoded JSON with emailAddress + historyId
        const decoded = Buffer.from(event.data.message.data ?? '', 'base64').toString();
        let pushData: GmailPushData;
        try {
            pushData = JSON.parse(decoded);
        } catch {
            logger.warn('Failed to parse Gmail push data', { decoded });
            return;
        }

        logger.info('Gmail push received', { email: pushData.emailAddress });

        // Resolve email → UID using the tokens collection
        const db = admin.firestore();
        const tokenSnap = await db.collectionGroup('tokens')
            .where('email', '==', pushData.emailAddress)
            .limit(1)
            .get();

        if (tokenSnap.empty) {
            logger.warn('No user found for Gmail push email', { email: pushData.emailAddress });
            return;
        }

        // The token doc path is users/{uid}/tokens/google — extract uid
        const uid = tokenSnap.docs[0].ref.parent.parent!.id;

        // Check permissions
        const permSnap = await db.doc(`users/${uid}/settings/gsuite_permissions`).get();
        if (!permSnap.data()?.gmail) return;

        // Debounce rapid-fire notifications
        if (await shouldDebounce(uid, 'gmail')) {
            logger.info('Gmail sync debounced', { uid });
            return;
        }

        await executeSyncForUser(uid, 'gmail', syncGmail);
    },
);

// ---------------------------------------------------------------------------
// Calendar Push Handler — HTTP endpoint for Google Calendar webhook
// ---------------------------------------------------------------------------

export const onCalendarPush = onRequest(
    {
        secrets: [GOOGLE_CLIENT_SECRET],
    },
    async (req, res) => {
        // Google sends a sync notification on initial watch setup — ignore it
        const resourceState = req.headers['x-goog-resource-state'] as string;
        if (resourceState === 'sync') {
            res.status(200).send('OK');
            return;
        }

        // Read the channel ID from Google's headers to resolve the user
        const channelId = req.headers['x-goog-channel-id'] as string;
        if (!channelId) {
            res.status(400).send('Missing channel ID');
            return;
        }

        const db = admin.firestore();
        const channelDoc = await db.doc(`watch_channels/${channelId}`).get();
        const channelData = channelDoc.data();

        if (!channelData || channelData.service !== 'calendar') {
            logger.warn('Unknown calendar channel', { channelId });
            res.status(404).send('Unknown channel');
            return;
        }

        const uid = channelData.uid;
        logger.info('Calendar push received', { uid, channelId, resourceState });

        // Debounce
        if (await shouldDebounce(uid, 'calendar')) {
            res.status(200).send('OK');
            return;
        }

        // Fire-and-forget: respond immediately so Google doesn't retry
        res.status(200).send('OK');

        await executeSyncForUser(uid, 'calendar', syncCalendar);
    },
);

// ---------------------------------------------------------------------------
// Drive Push Handler — HTTP endpoint for Google Drive webhook
// ---------------------------------------------------------------------------

export const onDrivePush = onRequest(
    {
        secrets: [GOOGLE_CLIENT_SECRET],
    },
    async (req, res) => {
        const resourceState = req.headers['x-goog-resource-state'] as string;
        if (resourceState === 'sync') {
            res.status(200).send('OK');
            return;
        }

        const channelId = req.headers['x-goog-channel-id'] as string;
        if (!channelId) {
            res.status(400).send('Missing channel ID');
            return;
        }

        const db = admin.firestore();
        const channelDoc = await db.doc(`watch_channels/${channelId}`).get();
        const channelData = channelDoc.data();

        if (!channelData || channelData.service !== 'drive') {
            logger.warn('Unknown drive channel', { channelId });
            res.status(404).send('Unknown channel');
            return;
        }

        const uid = channelData.uid;
        logger.info('Drive push received', { uid, channelId, resourceState });

        // Debounce — apply to drive only (docs piggybacking is fine)
        if (await shouldDebounce(uid, 'drive')) {
            res.status(200).send('OK');
            return;
        }

        // Respond immediately
        res.status(200).send('OK');

        // Sync both Drive metadata and Docs content (docs depend on drive)
        await executeSyncForUser(uid, 'drive', syncDrive);

        // Check if docs is also enabled before syncing document content
        const permSnap = await db.doc(`users/${uid}/settings/gsuite_permissions`).get();
        if (permSnap.data()?.docs) {
            await executeSyncForUser(uid, 'docs', syncDocs);
        }
    },
);

// ---------------------------------------------------------------------------
// Scheduled Polling — syncs services without push API support every 15 min
// ---------------------------------------------------------------------------

export const autoSyncPolled = onSchedule(
    {
        schedule: '*/15 * * * *',
        timeZone: 'UTC',
        timeoutSeconds: 300,
        memory: '512MiB',
        secrets: [GOOGLE_CLIENT_SECRET],
    },
    async () => {
        const db = admin.firestore();
        const userRefs = await db.collection('users').listDocuments();

        logger.info('autoSyncPolled: run started', { users: userRefs.length });

        let synced = 0;
        let skipped = 0;
        let failed = 0;

        for (const userRef of userRefs) {
            const uid = userRef.id;

            try {
                // Verify the user has a stored refresh token
                const tokenDoc = await db.doc(`users/${uid}/tokens/google`).get();
                if (!tokenDoc.data()?.refreshToken) {
                    skipped++;
                    continue;
                }

                // Read permissions
                const permSnap = await db.doc(`users/${uid}/settings/gsuite_permissions`).get();
                const perms = permSnap.data() ?? {};

                // Sync each polled service if enabled
                for (const service of POLLED_SERVICES) {
                    if (!perms[service]) continue;

                    const syncFn = getSyncFn(service);
                    if (!syncFn) continue;

                    await executeSyncForUser(uid, service, syncFn);
                    synced++;
                }
            } catch (err: any) {
                failed++;
                logger.error('autoSyncPolled: user failed', { uid, error: err.message });
            }
        }

        logger.info('autoSyncPolled: run complete', { synced, skipped, failed });
    },
);

// ---------------------------------------------------------------------------
// Watch Renewal — renews push notification watches before they expire.
// Gmail watches expire in ~7 days, Calendar in ~7 days, Drive in ~24 hours.
// Runs every 6 hours to catch Drive watches that expire soonest.
// ---------------------------------------------------------------------------

// Renew if expiration is within this window (12 hours in ms)
const RENEWAL_WINDOW_MS = 12 * 60 * 60 * 1000;

export const renewWatches = onSchedule(
    {
        schedule: '0 */6 * * *',
        timeZone: 'UTC',
        timeoutSeconds: 300,
        memory: '256MiB',
        secrets: [GOOGLE_CLIENT_SECRET],
    },
    async () => {
        const db = admin.firestore();
        const userRefs = await db.collection('users').listDocuments();

        logger.info('renewWatches: run started', { users: userRefs.length });

        let renewed = 0;
        let skipped = 0;

        for (const userRef of userRefs) {
            const uid = userRef.id;

            try {
                // Skip users without tokens
                const tokenDoc = await db.doc(`users/${uid}/tokens/google`).get();
                if (!tokenDoc.data()?.refreshToken) {
                    skipped++;
                    continue;
                }

                // Re-setup all watches — setupAllWatches tears down and recreates
                // only for enabled services, which is effectively a renewal
                const watchesSnap = await db.collection(`users/${uid}/watches`).get();
                const needsRenewal = watchesSnap.docs.some(doc => {
                    const exp = doc.data().expiration;
                    if (!exp) return true;
                    const expiresAt = parseInt(exp, 10);
                    return expiresAt - Date.now() < RENEWAL_WINDOW_MS;
                });

                if (needsRenewal) {
                    await setupAllWatches(uid);
                    renewed++;
                } else {
                    skipped++;
                }
            } catch (err: any) {
                logger.error('renewWatches: failed for user', { uid, error: err.message });
            }
        }

        logger.info('renewWatches: run complete', { renewed, skipped });
    },
);
