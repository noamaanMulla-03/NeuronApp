import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import * as crypto from 'crypto';
import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { getAccessTokenForUser } from '../lib/oauth';

// ---------------------------------------------------------------------------
// Watch Manager — sets up and tears down Google push notification channels
// for Gmail (Pub/Sub), Calendar (webhooks), and Drive (webhooks).
// ---------------------------------------------------------------------------

// GCP project and Pub/Sub topic for Gmail push notifications
const GMAIL_PUBSUB_TOPIC = 'projects/neuron-bb594/topics/gmail-push';

// Base URL for Cloud Functions HTTP endpoints (Calendar/Drive webhooks)
const WEBHOOK_BASE = 'https://us-central1-neuron-bb594.cloudfunctions.net';

// ---------------------------------------------------------------------------
// Gmail — uses Pub/Sub (Google's recommended approach for Gmail)
// ---------------------------------------------------------------------------

interface GmailWatchResponse {
    historyId: string;
    expiration: string; // epoch ms as string
}

/**
 * Calls Gmail users.watch() to receive push notifications via Pub/Sub.
 * Stores watch metadata at users/{uid}/watches/gmail.
 */
export async function setupGmailWatch(accessToken: string, uid: string): Promise<void> {
    const url = buildUrl(BASE_URLS.gmail, '/gmail/v1/users/me/watch');

    const response = await googleFetch<GmailWatchResponse>(accessToken, url, {
        method: 'POST',
        body: JSON.stringify({
            topicName: GMAIL_PUBSUB_TOPIC,
            labelIds: ['INBOX'],
        }),
    });

    const db = admin.firestore();
    await db.doc(`users/${uid}/watches/gmail`).set({
        historyId: response.historyId,
        expiration: response.expiration,
        createdAt: new Date().toISOString(),
    });

    logger.info(`Gmail watch set up for ${uid}`, {
        historyId: response.historyId,
        expiration: response.expiration,
    });
}

// ---------------------------------------------------------------------------
// Calendar — uses HTTP webhook channels
// ---------------------------------------------------------------------------

interface WatchChannelResponse {
    id: string;
    resourceId: string;
    expiration: string; // epoch ms as string
}

/**
 * Calls Calendar events.watch() for the user's primary calendar.
 * Stores channel metadata locally and in a global reverse-lookup collection.
 */
export async function setupCalendarWatch(accessToken: string, uid: string): Promise<void> {
    const channelId = crypto.randomUUID();
    const webhookUrl = `${WEBHOOK_BASE}/onCalendarPush`;

    const url = buildUrl(
        BASE_URLS.calendar,
        '/calendar/v3/calendars/primary/events/watch',
    );

    const response = await googleFetch<WatchChannelResponse>(accessToken, url, {
        method: 'POST',
        body: JSON.stringify({
            id: channelId,
            type: 'web_hook',
            address: webhookUrl,
        }),
    });

    const db = admin.firestore();
    const batch = db.batch();

    // Per-user watch metadata
    batch.set(db.doc(`users/${uid}/watches/calendar`), {
        channelId,
        resourceId: response.resourceId,
        expiration: response.expiration,
        createdAt: new Date().toISOString(),
    });

    // Global reverse lookup: channelId → uid + service
    batch.set(db.doc(`watch_channels/${channelId}`), {
        uid,
        service: 'calendar',
    });

    await batch.commit();

    logger.info(`Calendar watch set up for ${uid}`, { channelId });
}

// ---------------------------------------------------------------------------
// Drive — uses HTTP webhook channels on the changes endpoint
// ---------------------------------------------------------------------------

interface DriveStartPageTokenResponse {
    startPageToken: string;
}

/**
 * Calls Drive changes.watch() to receive push notifications for file changes.
 * First fetches the current startPageToken so incremental syncs know where
 * to resume from.
 */
export async function setupDriveWatch(accessToken: string, uid: string): Promise<void> {
    // Get the current change cursor before setting up the watch
    const tokenUrl = buildUrl(
        BASE_URLS.drive,
        '/drive/v3/changes/startPageToken',
    );
    const tokenRes = await googleFetch<DriveStartPageTokenResponse>(accessToken, tokenUrl);

    const channelId = crypto.randomUUID();
    const webhookUrl = `${WEBHOOK_BASE}/onDrivePush`;

    const watchUrl = buildUrl(
        BASE_URLS.drive,
        '/drive/v3/changes/watch',
    );

    const response = await googleFetch<WatchChannelResponse>(accessToken, watchUrl, {
        method: 'POST',
        body: JSON.stringify({
            id: channelId,
            type: 'web_hook',
            address: webhookUrl,
            payload: true,
        }),
    });

    const db = admin.firestore();
    const batch = db.batch();

    batch.set(db.doc(`users/${uid}/watches/drive`), {
        channelId,
        resourceId: response.resourceId,
        startPageToken: tokenRes.startPageToken,
        expiration: response.expiration,
        createdAt: new Date().toISOString(),
    });

    batch.set(db.doc(`watch_channels/${channelId}`), {
        uid,
        service: 'drive',
    });

    await batch.commit();

    logger.info(`Drive watch set up for ${uid}`, { channelId });
}

// ---------------------------------------------------------------------------
// Teardown — stops a watch channel and cleans up Firestore metadata
// ---------------------------------------------------------------------------

type WatchableService = 'gmail' | 'calendar' | 'drive';

/**
 * Stops a Google push notification channel and removes stored metadata.
 * Gmail watches are stopped via the Gmail API; Calendar/Drive via the
 * Channels API. Failures are logged but not thrown (best-effort cleanup).
 */
export async function teardownWatch(uid: string, service: WatchableService): Promise<void> {
    const db = admin.firestore();
    const watchDoc = await db.doc(`users/${uid}/watches/${service}`).get();
    const data = watchDoc.data();

    if (!data) return; // No watch to tear down

    try {
        let accessToken: string;
        try {
            accessToken = await getAccessTokenForUser(uid);
        } catch {
            // Token unavailable — skip API call, just clean Firestore
            logger.warn(`Cannot get token to teardown ${service} watch for ${uid}, cleaning metadata only`);
            await cleanupWatchMetadata(db, uid, service, data.channelId);
            return;
        }

        if (service === 'gmail') {
            // Gmail watches expire naturally — Google provides no explicit stop API
            // Just clean up our Firestore metadata
        } else {
            // Calendar and Drive use the Channels stop API
            const stopUrl = service === 'calendar'
                ? 'https://www.googleapis.com/calendar/v3/channels/stop'
                : 'https://www.googleapis.com/drive/v3/channels/stop';

            await googleFetch(accessToken, stopUrl, {
                method: 'POST',
                body: JSON.stringify({
                    id: data.channelId,
                    resourceId: data.resourceId,
                }),
            });
        }
    } catch (err: any) {
        logger.warn(`Failed to stop ${service} channel for ${uid}`, { error: err.message });
    }

    // Always clean up Firestore metadata regardless of API success
    await cleanupWatchMetadata(db, uid, service, data.channelId);
}

async function cleanupWatchMetadata(
    db: admin.firestore.Firestore,
    uid: string,
    service: WatchableService,
    channelId?: string,
): Promise<void> {
    const batch = db.batch();
    batch.delete(db.doc(`users/${uid}/watches/${service}`));
    if (channelId) {
        batch.delete(db.doc(`watch_channels/${channelId}`));
    }
    await batch.commit();
}

// ---------------------------------------------------------------------------
// Orchestrator — sets up watches for all push-capable services that the user
// has enabled. Called after permission changes and on watch renewal.
// ---------------------------------------------------------------------------

const PUSH_SERVICES: WatchableService[] = ['gmail', 'calendar', 'drive'];

/**
 * Reads the user's permissions and sets up push watches for all enabled
 * push-capable services (gmail, calendar, drive). Tears down watches for
 * any disabled services. Idempotent — re-creating a watch just replaces it.
 */
export async function setupAllWatches(uid: string): Promise<void> {
    const db = admin.firestore();

    // Read permissions to know which services are enabled
    const permSnap = await db.doc(`users/${uid}/settings/gsuite_permissions`).get();
    const perms = permSnap.data() ?? {};

    let accessToken: string;
    try {
        accessToken = await getAccessTokenForUser(uid);
    } catch (err: any) {
        logger.error(`Cannot set up watches for ${uid} — no access token`, { error: err.message });
        return;
    }

    for (const service of PUSH_SERVICES) {
        if (perms[service]) {
            try {
                // Teardown existing watch first (idempotent cleanup)
                await teardownWatch(uid, service);

                // Set up fresh watch
                switch (service) {
                    case 'gmail':
                        await setupGmailWatch(accessToken, uid);
                        break;
                    case 'calendar':
                        await setupCalendarWatch(accessToken, uid);
                        break;
                    case 'drive':
                        await setupDriveWatch(accessToken, uid);
                        break;
                }
            } catch (err: any) {
                logger.error(`Failed to set up ${service} watch for ${uid}`, { error: err.message });
            }
        } else {
            // Service disabled — tear down any existing watch
            await teardownWatch(uid, service);
        }
    }
}
