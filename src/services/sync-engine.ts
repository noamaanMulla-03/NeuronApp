import { useGSuiteStore, ServiceName, SERVICE_NAMES } from '../store/gsuiteStore';
import { syncGmail } from './gmail';
import { syncDrive } from './drive';
import { syncCalendar } from './calendar';
import { syncContacts } from './contacts';
import { syncTasks } from './tasks';
import { syncDocs } from './docs';

type SyncFunction = (uid: string) => Promise<number>;

const SERVICE_SYNC_MAP: Record<ServiceName, SyncFunction> = {
    gmail: syncGmail,
    drive: syncDrive,
    calendar: syncCalendar,
    contacts: syncContacts,
    tasks: syncTasks,
    docs: syncDocs,
};

/**
 * Sync a single service. Updates store status in real-time.
 */
export async function syncService(
    uid: string,
    service: ServiceName,
): Promise<{ service: ServiceName; itemCount: number; error?: string }> {
    const store = useGSuiteStore.getState();
    store.setSyncStatus(service, 'syncing');

    try {
        const syncFn = SERVICE_SYNC_MAP[service];
        const itemCount = await syncFn(uid);
        store.markSyncDone(service, itemCount);
        return { service, itemCount };
    } catch (error: any) {
        const message = error?.message ?? 'Unknown error';
        store.setSyncStatus(service, 'error', message);
        return { service, itemCount: 0, error: message };
    }
}

/**
 * Run sync for all enabled services. Services run in parallel with
 * error isolation — one service failing doesn't block others.
 *
 * Docs sync runs after Drive completes (needs file list).
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

    // Docs depends on Drive — separate them
    const independent = enabledServices.filter(s => s !== 'docs');
    const hasDocs = enabledServices.includes('docs');

    // Run independent services in parallel
    const results = await Promise.all(
        independent.map(service => syncService(uid, service)),
    );

    // Run docs after drive (if both enabled)
    if (hasDocs) {
        const docsResult = await syncService(uid, 'docs');
        results.push(docsResult);
    }

    const totalItems = results.reduce((sum, r) => sum + r.itemCount, 0);

    // Persist sync meta to Firestore
    await useGSuiteStore.getState().saveSyncMeta(uid);

    return { results, totalItems };
}
