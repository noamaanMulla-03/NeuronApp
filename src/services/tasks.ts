import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, readUserDoc, writeUserDoc } from '../lib/firestore';

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

export async function syncTasks(uid: string): Promise<number> {
    const meta = await readUserDoc(uid, ['sync_meta', 'status']);
    const lastSync = meta?.tasks?.lastSync;

    // 1. Fetch task lists
    const listsUrl = buildUrl(API, '/tasks/v1/users/@me/lists', {
        maxResults: '100',
    });
    const listsResponse = await googleFetch<TaskListsResponse>(listsUrl);
    const taskLists = listsResponse.items ?? [];

    // Store task lists
    if (taskLists.length > 0) {
        const listWrites = taskLists.map(list => ({
            // Flat 2-segment path: users/{uid}/tasks_lists/{id} = 4 total (even = valid doc ref)
            path: ['tasks_lists', list.id],
            data: {
                title: list.title,
                updated: list.updated,
                syncedAt: new Date().toISOString(),
            },
        }));
        await batchWriteUserDocs(uid, listWrites);
    }

    // 2. Fetch tasks from each list
    let totalTasks = 0;

    for (const list of taskLists) {
        const allTasks: Task[] = [];
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
            const response = await googleFetch<TasksResponse>(url);

            if (response.items) {
                allTasks.push(...response.items);
            }
            pageToken = response.nextPageToken;
        } while (pageToken);

        if (allTasks.length > 0) {
            const writes = allTasks.map(task => ({
                // Flat 2-segment path: users/{uid}/tasks_items/{id} = 4 total (even = valid doc ref)
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
