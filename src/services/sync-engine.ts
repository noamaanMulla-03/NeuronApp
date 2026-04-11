import { useGSuiteStore, ServiceName, SERVICE_NAMES } from '../store/gsuiteStore';
import { getAccessToken } from '../lib/google-api';

/**
 * Sync a single service remotely via Firebase Cloud Functions.
 * This prevents OOM errors on the mobile device by offloading the 
 * heavy data processing to the server.
 */
export async function syncService(
    uid: string,
    service: ServiceName,
): Promise<{ service: ServiceName; itemCount: number; error?: string }> {
    const store = useGSuiteStore.getState();
    store.setSyncStatus(service, 'syncing');

    try {
        // 1. Get a fresh access token for the Cloud Function to use
        const accessToken = await getAccessToken();

        // 2. Get the Firebase ID token for authentication
        const { auth } = require('../lib/firebase');
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        const idToken = await user.getIdToken();

        console.info(`Calling remote syncService for ${service}...`);
        
        // 3. Call the remote sync function via raw fetch
        // We use raw fetch because the Firebase SDK's httpsCallable has 
        // known parsing issues in some React Native environments with v2 functions.
        // It's also much easier to debug raw network requests.
        const response = await fetch('https://us-central1-neuron-bb594.cloudfunctions.net/syncService', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                data: {
                    service,
                    accessToken,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }

        const json = await response.json();
        
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
