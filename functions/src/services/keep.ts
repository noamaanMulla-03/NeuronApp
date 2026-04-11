import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from './firestore';

const API = BASE_URLS.keep;

interface KeepNote {
  name: string;
  title: string;
  body?: { text?: { text: string } };
  createTime: string;
  updateTime: string;
}

export async function syncKeep(accessToken: string, uid: string): Promise<number> {
  let totalItemCount = 0;

  try {
    const url = buildUrl(API, '/v1/notes');
    const response = await googleFetch<{ notes?: KeepNote[] }>(accessToken, url);

    if (response.notes && response.notes.length > 0) {
      const writes = response.notes.map(note => {
        const id = note.name.split('/').pop() || note.name;
        return {
          path: ['keep_notes', id],
          data: {
            title: note.title,
            body: note.body?.text?.text ?? '',
            createTime: note.createTime,
            updateTime: note.updateTime,
            syncedAt: new Date().toISOString(),
          },
        };
      });
      await batchWriteUserDocs(uid, writes);
      totalItemCount += writes.length;
    }
  } catch (error: any) {
    console.warn('Keep API sync failed (might require Enterprise Workspace):', error.message);
  }

  await writeUserDoc(uid, ['sync_meta', 'status'], {
    keep: {
      lastSync: new Date().toISOString(),
      status: 'done',
      itemCount: totalItemCount,
    },
  });

  return totalItemCount;
}
