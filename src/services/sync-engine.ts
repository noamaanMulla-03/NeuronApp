import { getFunctions, httpsCallable } from 'firebase/functions';
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

        // 2. Call the remote sync function
        const functions = getFunctions();
        const remoteSync = httpsCallable<{ service: string; accessToken: string }, { itemCount: number }>(
            functions, 
            'syncService'
        );
        
        const response = await remoteSync({ service, accessToken });
        const itemCount = response.data.itemCount;

        store.markSyncDone(service, itemCount);
        return { service, itemCount };
    } catch (error: any) {
        console.error(`Cloud Sync failed for ${service}:`, error);
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
