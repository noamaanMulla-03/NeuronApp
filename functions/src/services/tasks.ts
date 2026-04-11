import * as admin from 'firebase-admin';
import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from './firestore';

const API = BASE_URLS.tasks;

interface TaskList {
  id: string;
  title: string;
  updated: string;
}

interface Task {
  id: string;
  title: string;
  notes?: string;
  status: string;
  due?: string;
  completed?: string;
  updated: string;
  parent?: string;
  position: string;
  links?: { type: string; description: string; link: string }[];
}

interface TaskListsResponse {
  items: TaskList[];
  nextPageToken?: string;
}

interface TasksResponse {
  items?: Task[];
  nextPageToken?: string;
}

export async function syncTasks(accessToken: string, uid: string): Promise<number> {
  const db = admin.firestore();
  const metaRef = db.doc(`users/${uid}/sync_meta/status`);
  const metaDoc = await metaRef.get();
  const metaData = metaDoc.data();
  const lastSync = metaData?.tasks?.lastSync;

  const listsUrl = buildUrl(API, '/tasks/v1/users/@me/lists', {
    maxResults: '100',
  });
  const listsResponse = await googleFetch<TaskListsResponse>(accessToken, listsUrl);
  const taskLists = listsResponse.items ?? [];

  if (taskLists.length > 0) {
    const listWrites = taskLists.map(list => ({
      path: ['tasks_lists', list.id],
      data: {
        title: list.title,
        updated: list.updated,
        syncedAt: new Date().toISOString(),
      },
    }));
    await batchWriteUserDocs(uid, listWrites);
  }

  let totalTasks = 0;
  for (const list of taskLists) {
    let pageToken: string | undefined;

    do {
      const params: Record<string, string | undefined> = {
        maxResults: '100',
        showCompleted: 'true',
        showHidden: 'true',
        pageToken,
      };

      if (lastSync) {
        params.updatedMin = lastSync;
      }

      const url = buildUrl(
        API,
        `/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks`,
        params,
      );
      const response = await googleFetch<TasksResponse>(accessToken, url);

      if (response.items && response.items.length > 0) {
        const writes = response.items.map(task => ({
          path: ['tasks_items', task.id],
          data: {
            listId: list.id,
            listTitle: list.title,
            title: task.title,
            notes: task.notes ?? '',
            status: task.status,
            due: task.due ?? null,
            completed: task.completed ?? null,
            updated: task.updated,
            parent: task.parent ?? null,
            position: task.position,
            links: task.links ?? [],
            syncedAt: new Date().toISOString(),
          },
        }));
        
        await batchWriteUserDocs(uid, writes);
        totalTasks += writes.length;
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
  }

  await writeUserDoc(uid, ['sync_meta', 'status'], {
    tasks: {
      lastSync: new Date().toISOString(),
      status: 'done',
      itemCount: totalTasks,
    },
  });

  return totalTasks;
}
