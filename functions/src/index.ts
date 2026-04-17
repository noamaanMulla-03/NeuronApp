import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import {
    exchangeAuthCode,
    getAccessTokenForUser,
    storeTokens,
    GOOGLE_CLIENT_SECRET,
} from './lib/oauth';
import { setupAllWatches } from './services/watch-manager';
import { syncGmail } from './services/gmail';
import { syncDrive } from './services/drive';
import { syncDocs } from './services/docs';
import { syncCalendar } from './services/calendar';
import { syncContacts } from './services/contacts';
import { syncTasks } from './services/tasks';
import { syncKeep } from './services/keep';
import { syncChat } from './services/chat';

// Initialize Firebase Admin
admin.initializeApp();

// Set global options for all functions
setGlobalOptions({
    maxInstances: 10,
    timeoutSeconds: 300,
    memory: '512MiB',
});

// ---------------------------------------------------------------------------
// Service name → sync function mapping (reused by initializeSync)
// ---------------------------------------------------------------------------
const SERVICE_NAMES = ['gmail', 'drive', 'calendar', 'contacts', 'tasks', 'docs', 'keep', 'chat'] as const;
type ServiceName = (typeof SERVICE_NAMES)[number];

const SYNC_FNS: Record<ServiceName, (accessToken: string, uid: string) => Promise<number>> = {
    gmail: syncGmail,
    drive: syncDrive,
    calendar: syncCalendar,
    contacts: syncContacts,
    tasks: syncTasks,
    docs: syncDocs,
    keep: syncKeep,
    chat: syncChat,
};

// ---------------------------------------------------------------------------
// storeRefreshToken — exchanges a one-time server auth code for a refresh
// token and persists it. Called once after Google sign-in on the client.
// ---------------------------------------------------------------------------
export const storeRefreshToken = onCall<{ authCode: string }>(
    { secrets: [GOOGLE_CLIENT_SECRET] },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Must be authenticated.');
        }

        const { authCode } = request.data;
        if (!authCode) {
            throw new HttpsError('invalid-argument', 'authCode is required.');
        }

        const uid = request.auth.uid;
        const email = request.auth.token.email ?? '';

        try {
            const { refreshToken } = await exchangeAuthCode(authCode);
            await storeTokens(uid, refreshToken, email);
            logger.info('Refresh token stored', { uid });
            return { success: true };
        } catch (err: any) {
            logger.error('storeRefreshToken failed', { uid, error: err.message });
            throw new HttpsError('internal', err.message);
        }
    },
);

// ---------------------------------------------------------------------------
// initializeSync — server-side initial sync + watch setup. Called after the
// user grants or changes GSuite permissions. Replaces the old client-driven
// syncService callable entirely.
// ---------------------------------------------------------------------------
export const initializeSync = onCall(
    { secrets: [GOOGLE_CLIENT_SECRET] },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Must be authenticated.');
        }

        const uid = request.auth.uid;
        const db = admin.firestore();

        // Read which services the user has enabled
        const permSnap = await db.doc(`users/${uid}/settings/gsuite_permissions`).get();
        const perms = permSnap.data() ?? {};
        const enabled = SERVICE_NAMES.filter(s => perms[s]);

        if (enabled.length === 0) {
            return { success: true, results: [] };
        }

        let accessToken: string;
        try {
            accessToken = await getAccessTokenForUser(uid);
        } catch (err: any) {
            throw new HttpsError('failed-precondition', 'No refresh token stored. Please re-authenticate.');
        }

        // Run sync for each enabled service sequentially (Drive before Docs)
        const results: { service: string; itemCount: number; error?: string }[] = [];

        for (const service of enabled) {
            const updateMeta = async (
                status: 'syncing' | 'done' | 'error',
                itemCount?: number,
                error?: string,
            ) => {
                const update: Record<string, any> = {
                    [`${service}.status`]: status,
                    [`${service}.error`]: error ?? null,
                };
                if (status === 'done' && itemCount !== undefined) {
                    update[`${service}.lastSync`] = new Date().toISOString();
                    update[`${service}.itemCount`] = itemCount;
                }
                await db.doc(`users/${uid}/sync_meta/status`).set(update, { merge: true });
            };

            try {
                await updateMeta('syncing');
                const itemCount = await SYNC_FNS[service](accessToken, uid);
                await updateMeta('done', itemCount);
                results.push({ service, itemCount });
                logger.info(`initializeSync: ${service} done`, { uid, itemCount });
            } catch (err: any) {
                await updateMeta('error', undefined, err.message);
                results.push({ service, itemCount: 0, error: err.message });
                logger.error(`initializeSync: ${service} failed`, { uid, error: err.message });
            }
        }

        // Set up push notification watches for Gmail/Calendar/Drive
        try {
            await setupAllWatches(uid);
        } catch (err: any) {
            logger.error('initializeSync: watch setup failed', { uid, error: err.message });
        }

        return { success: true, results };
    },
);

// ---------------------------------------------------------------------------
// Real-time push handlers, scheduled polling, and watch renewal
// ---------------------------------------------------------------------------
export { onGmailPush, onCalendarPush, onDrivePush, autoSyncPolled, renewWatches } from './services/auto-sync';

// AI & Semantic Memory Features
export * from './services/vector-sync';
export * from './services/chat-retrieval';
export * from './services/daily-briefing';
export { summarizeConversations } from './services/episodic-memory';
export { resolveConflict } from './services/conflict-resolver';
export { extractStyle, generateSmartReplies, generateDraft, sendDraft, refreshStyleProfiles } from './services/ghostwriter';
