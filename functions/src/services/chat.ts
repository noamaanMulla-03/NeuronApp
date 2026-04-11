import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from './firestore';

const API = BASE_URLS.chat;

interface ChatSpace {
  name: string;
  type: string;
  displayName?: string;
}

export async function syncChat(accessToken: string, uid: string): Promise<number> {
  let totalItemCount = 0;
  let pageToken: string | undefined;

  try {
    do {
      const url = buildUrl(API, '/v1/users/me/spaces', {
        pageSize: '100',
        pageToken,
      });
      const response = await googleFetch<{ spaces?: ChatSpace[], nextPageToken?: string }>(accessToken, url);

      if (response.spaces && response.spaces.length > 0) {
        const writes = response.spaces.map(space => {
          const id = space.name.replace('spaces/', '');
          return {
            path: ['chat_spaces', id],
            data: {
              name: space.name,
              type: space.type,
              displayName: space.displayName ?? '',
              syncedAt: new Date().toISOString(),
            },
          };
        });
        await batchWriteUserDocs(uid, writes);
        totalItemCount += writes.length;
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
  } catch (error: any) {
    console.warn('Chat API sync failed:', error.message);
  }

  await writeUserDoc(uid, ['sync_meta', 'status'], {
    chat: {
      lastSync: new Date().toISOString(),
      status: 'done',
      itemCount: totalItemCount,
    },
  });

  return totalItemCount;
}
