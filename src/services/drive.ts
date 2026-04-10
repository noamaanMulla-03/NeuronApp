import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, readUserDoc, writeUserDoc } from '../lib/firestore';

const API = BASE_URLS.drive;

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime: string;
    createdTime: string;
    parents?: string[];
    webViewLink?: string;
    iconLink?: string;
    owners?: { displayName: string; emailAddress: string }[];
    shared: boolean;
}

interface DriveListResponse {
    files: DriveFile[];
    nextPageToken?: string;
}

const DRIVE_FIELDS = [
    'id',
    'name',
    'mimeType',
    'size',
    'modifiedTime',
    'createdTime',
    'parents',
    'webViewLink',
    'iconLink',
    'owners',
    'shared',
].join(',');

export async function syncDrive(uid: string): Promise<number> {
    // Incremental: only fetch files modified after last sync
    const meta = await readUserDoc(uid, ['sync_meta', 'status']);
    const lastSync = meta?.drive?.lastSync;

    const allFiles: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
        const params: Record<string, string | undefined> = {
            pageSize: '100',
            fields: `nextPageToken,files(${DRIVE_FIELDS})`,
            orderBy: 'modifiedTime desc',
            pageToken,
        };

        if (lastSync) {
            params.q = `modifiedTime > '${lastSync}'`;
        }

        const url = buildUrl(API, '/drive/v3/files', params);
        const response = await googleFetch<DriveListResponse>(url);

        if (response.files) {
            allFiles.push(...response.files);
        }
        pageToken = response.nextPageToken;
    } while (pageToken);

    if (allFiles.length > 0) {
        const writes = allFiles.map(file => ({
            // Flat 2-segment path: users/{uid}/drive_files/{id} = 4 total (even = valid doc ref)
            path: ['drive_files', file.id],
            data: {
                name: file.name,
                mimeType: file.mimeType,
                size: file.size ?? null,
                modifiedTime: file.modifiedTime,
                createdTime: file.createdTime,
                parents: file.parents ?? [],
                webViewLink: file.webViewLink ?? null,
                iconLink: file.iconLink ?? null,
                owners: file.owners ?? [],
                shared: file.shared,
                syncedAt: new Date().toISOString(),
            },
        }));

        await batchWriteUserDocs(uid, writes);
    }

    await writeUserDoc(uid, ['sync_meta', 'status'], {
        drive: {
            lastSync: new Date().toISOString(),
            status: 'done',
            itemCount: allFiles.length,
        },
    });

    return allFiles.length;
}

/**
 * Returns file IDs of Google Workspace documents (Docs, Sheets, Slides)
 * from the most recent Drive sync results.
 */
export async function getWorkspaceFileIds(_uid: string): Promise<
    { id: string; mimeType: string }[]
> {
    // We re-fetch from Firestore to avoid holding all files in memory
    // In practice, this could be a Firestore query with mimeType filter
    const WORKSPACE_MIMETYPES = [
        'application/vnd.google-apps.document',
        'application/vnd.google-apps.spreadsheet',
        'application/vnd.google-apps.presentation',
    ];

    const allFiles: { id: string; mimeType: string }[] = [];
    let pageToken: string | undefined;

    do {
        const mimeQuery = WORKSPACE_MIMETYPES.map(
            m => `mimeType='${m}'`,
        ).join(' or ');

        const url = buildUrl(API, '/drive/v3/files', {
            pageSize: '100',
            fields: 'nextPageToken,files(id,mimeType)',
            q: mimeQuery,
            pageToken,
        });

        const response = await googleFetch<DriveListResponse>(url);
        if (response.files) {
            allFiles.push(...response.files.map(f => ({ id: f.id, mimeType: f.mimeType })));
        }
        pageToken = response.nextPageToken;
    } while (pageToken);

    return allFiles;
}
