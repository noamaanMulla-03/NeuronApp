import * as admin from 'firebase-admin';
import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from './firestore';

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

export async function syncDrive(accessToken: string, uid: string): Promise<number> {
  const db = admin.firestore();
  const metaRef = db.doc(`users/${uid}/sync_meta/status`);
  const metaDoc = await metaRef.get();
  const metaData = metaDoc.data();
  const lastSync = metaData?.drive?.lastSync;

  let totalItemCount = 0;
  let pageToken: string | undefined;

  do {
    const params: Record<string, string | undefined> = {
      pageSize: '1000', // Server can handle larger pages
      fields: `nextPageToken,files(${DRIVE_FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageToken,
    };

    if (lastSync) {
      params.q = `modifiedTime > '${lastSync}'`;
    }

    const url = buildUrl(API, '/drive/v3/files', params);
    const response = await googleFetch<DriveListResponse>(accessToken, url);

    if (response.files && response.files.length > 0) {
      const writes = response.files.map(file => ({
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
      totalItemCount += writes.length;
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  await writeUserDoc(uid, ['sync_meta', 'status'], {
    drive: {
      lastSync: new Date().toISOString(),
      status: 'done',
      itemCount: totalItemCount,
    },
  });

  return totalItemCount;
}

export async function getWorkspaceFileIds(accessToken: string): Promise<
    { id: string; mimeType: string }[]
> {
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
      pageSize: '1000',
      fields: 'nextPageToken,files(id,mimeType)',
      q: mimeQuery,
      pageToken,
    });

    const response = await googleFetch<DriveListResponse>(accessToken, url);
    if (response.files) {
      allFiles.push(...response.files.map(f => ({ id: f.id, mimeType: f.mimeType })));
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  return allFiles;
}
