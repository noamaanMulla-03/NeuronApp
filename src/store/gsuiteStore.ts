import { create } from 'zustand';
import { readUserDoc, writeUserDoc } from '../lib/firestore';

export const SERVICE_NAMES = [
    'gmail',
    'drive',
    'calendar',
    'contacts',
    'tasks',
    'docs',
    'keep',
    'chat',
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

export interface ServiceSyncMeta {
    status: SyncStatus;
    lastSync: string | null;
    itemCount: number;
    error: string | null;
}

interface GSuiteState {
    permissions: Record<ServiceName, boolean>;
    syncMeta: Record<ServiceName, ServiceSyncMeta>;

    setPermission: (service: ServiceName, enabled: boolean) => void;
    setAllPermissions: (permissions: Record<ServiceName, boolean>) => void;
    setSyncStatus: (service: ServiceName, status: SyncStatus, error?: string) => void;
    setSyncItemCount: (service: ServiceName, count: number) => void;
    markSyncDone: (service: ServiceName, itemCount: number) => void;

    loadPermissions: (uid: string) => Promise<void>;
    savePermissions: (uid: string) => Promise<void>;
    loadSyncMeta: (uid: string) => Promise<void>;
    saveSyncMeta: (uid: string) => Promise<void>;
}

const defaultSyncMeta: ServiceSyncMeta = {
    status: 'idle',
    lastSync: null,
    itemCount: 0,
    error: null,
};

function createDefaultPermissions(): Record<ServiceName, boolean> {
    return Object.fromEntries(SERVICE_NAMES.map(s => [s, false])) as Record<ServiceName, boolean>;
}

function createDefaultSyncMeta(): Record<ServiceName, ServiceSyncMeta> {
    return Object.fromEntries(
        SERVICE_NAMES.map(s => [s, { ...defaultSyncMeta }]),
    ) as Record<ServiceName, ServiceSyncMeta>;
}

export const useGSuiteStore = create<GSuiteState>((set, get) => ({
    permissions: createDefaultPermissions(),
    syncMeta: createDefaultSyncMeta(),

    setPermission: (service, enabled) =>
        set(state => ({
            permissions: { ...state.permissions, [service]: enabled },
        })),

    setAllPermissions: (permissions) => set({ permissions }),

    setSyncStatus: (service, status, error) =>
        set(state => ({
            syncMeta: {
                ...state.syncMeta,
                [service]: {
                    ...state.syncMeta[service],
                    status,
                    error: error ?? null,
                },
            },
        })),

    setSyncItemCount: (service, count) =>
        set(state => ({
            syncMeta: {
                ...state.syncMeta,
                [service]: { ...state.syncMeta[service], itemCount: count },
            },
        })),

    markSyncDone: (service, itemCount) =>
        set(state => ({
            syncMeta: {
                ...state.syncMeta,
                [service]: {
                    status: 'done',
                    lastSync: new Date().toISOString(),
                    itemCount: state.syncMeta[service].itemCount + itemCount,
                    error: null,
                },
            },
        })),

    loadPermissions: async (uid) => {
        const data = await readUserDoc(uid, ['settings', 'gsuite_permissions']);
        if (data) {
            const perms = createDefaultPermissions();
            for (const key of SERVICE_NAMES) {
                if (typeof data[key] === 'boolean') {
                    perms[key] = data[key];
                }
            }
            set({ permissions: perms });
        }
    },

    savePermissions: async (uid) => {
        const { permissions } = get();
        await writeUserDoc(uid, ['settings', 'gsuite_permissions'], { ...permissions });
    },

    loadSyncMeta: async (uid) => {
        const data = await readUserDoc(uid, ['sync_meta', 'status']);
        if (data) {
            const meta = createDefaultSyncMeta();
            for (const key of SERVICE_NAMES) {
                if (data[key]) {
                    meta[key] = { ...defaultSyncMeta, ...data[key] };
                }
            }
            set({ syncMeta: meta });
        }
    },

    saveSyncMeta: async (uid) => {
        const { syncMeta } = get();
        await writeUserDoc(uid, ['sync_meta', 'status'], { ...syncMeta });
    },
}));
