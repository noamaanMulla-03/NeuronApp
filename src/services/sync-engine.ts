import { useGSuiteStore, ServiceName, SERVICE_NAMES } from '../store/gsuiteStore';
import { refreshAccessToken } from '../lib/google-api';

const SYNC_URL = 'https://us-central1-neuron-bb594.cloudfunctions.net/syncService';

// Shared fetch logic — extracted so the retry path can reuse it without duplication.
async function callSyncFunction(
    service: ServiceName,
    accessToken: string,
    idToken: string,
): Promise<Response> {
    return fetch(SYNC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ data: { service, accessToken } }),
    });
}

/**
 * Sync a single service remotely via Firebase Cloud Functions.
 * Always force-refreshes the Google access token before calling the
 * backend so it never arrives expired. Retries once on 401.
 */
export async function syncService(
    uid: string,
    service: ServiceName,
): Promise<{ service: ServiceName; itemCount: number; error?: string }> {
    const store = useGSuiteStore.getState();
    store.setSyncStatus(service, 'syncing');

    try {
        // 1. Force-refresh the Google access token so the backend always
        //    receives one with a full ~60 min lifetime.
        let accessToken = await refreshAccessToken();

        // 2. Get the Firebase ID token for Cloud Functions auth
        const { auth } = require('../lib/firebase');
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        const idToken = await user.getIdToken();

        console.info(`Calling remote syncService for ${service}...`);

        // 3. Call the Cloud Function
        let response = await callSyncFunction(service, accessToken, idToken);

        // 4. On 401 — refresh token one more time and retry once
        if (response.status === 401) {
            console.warn(`Token rejected for ${service}, refreshing and retrying...`);
            accessToken = await refreshAccessToken();
            response = await callSyncFunction(service, accessToken, idToken);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }

        const json = await response.json() as any;

        // Firebase onCall responses are wrapped in a "result" field
        const result = json.result;

        if (!result || result.success === false) {
            throw new Error(result?.error || 'Unknown error from sync service');
        }

        const itemCount = result.itemCount || 0;
        console.info(`Successfully synced ${itemCount} items for ${service}`);

        store.markSyncDone(service, itemCount);
        return { service, itemCount };
    } catch (error: any) {
        console.error(`Cloud Sync failed for ${service}:`, error.message);
        const message = error?.message ?? 'Unknown error';
        store.setSyncStatus(service, 'error', message);
        return { service, itemCount: 0, error: message };
    }
}

/**
 * Run sync for all enabled services sequentially. 
 * Serial execution prevents Out-Of-Memory (OOM) errors on Android by 
 * ensuring only one service's network and processing logic is active at a time.
 * Error isolation is maintained — one service failing doesn't block others.
 */
export async function runFullSync(uid: string): Promise<{
    results: { service: ServiceName; itemCount: number; error?: string }[];
    totalItems: number;
}> {
    const { permissions } = useGSuiteStore.getState();

    const enabledServices = SERVICE_NAMES.filter(s => permissions[s]);
    if (enabledServices.length === 0) {
        return { results: [], totalItems: 0 };
    }

    // Docs depends on Drive — we process Drive first
    // By processing everything sequentially, we naturally satisfy the Drive -> Docs dependency
    const results: { service: ServiceName; itemCount: number; error?: string }[] = [];

    for (const service of enabledServices) {
        const result = await syncService(uid, service);
        results.push(result);
    }

    const totalItems = results.reduce((sum, r) => sum + r.itemCount, 0);

    // Persist sync meta to Firestore
    await useGSuiteStore.getState().saveSyncMeta(uid);

    return { results, totalItems };
}
