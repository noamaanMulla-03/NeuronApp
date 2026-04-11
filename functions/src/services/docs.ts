import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from './firestore';
import { getWorkspaceFileIds } from './drive';

const MIME_TO_EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

async function fetchDocContent(
  accessToken: string,
  fileId: string,
  mimeType: string,
): Promise<{ title: string; text: string }> {
  const metaUrl = buildUrl(BASE_URLS.drive, `/drive/v3/files/${fileId}`, {
    fields: 'name',
  });

  let title = 'Untitled Document';
  try {
    const meta = await googleFetch<{ name: string }>(accessToken, metaUrl);
    title = meta.name;
  } catch (e) {
    console.warn(`Failed to fetch metadata for ${fileId}`, e);
  }

  const exportMime = MIME_TO_EXPORT[mimeType];
  const exportUrl = buildUrl(BASE_URLS.drive, `/drive/v3/files/${fileId}/export`, {
    mimeType: exportMime,
  });

  try {
    const text = await googleFetch<string>(accessToken, exportUrl, { responseType: 'text' });
    return { title, text };
  } catch (e) {
    console.error(`Failed to export file ${fileId}:`, e);
    return { title, text: '(Failed to extract content)' };
  }
}

async function fetchDocComments(accessToken: string, fileId: string): Promise<{ author: string; content: string }[]> {
  const url = buildUrl(BASE_URLS.drive, `/drive/v3/files/${fileId}/comments`, {
    fields: 'comments(author(displayName),content,resolved)',
  });

  try {
    const response = await googleFetch<{
      comments?: { author?: { displayName?: string }; content?: string; resolved?: boolean }[];
    }>(accessToken, url);
    if (!response.comments) return [];

    return response.comments
      .filter(c => !c.resolved && c.content)
      .map(c => ({
        author: c.author?.displayName ?? 'Unknown',
        content: c.content ?? '',
      }));
  } catch (e) {
    console.warn(`Failed to fetch comments for ${fileId}`, e);
    return [];
  }
}

export async function syncDocs(accessToken: string, uid: string): Promise<number> {
  const workspaceFiles = await getWorkspaceFileIds(accessToken);

  if (workspaceFiles.length === 0) {
    return 0;
  }

  // On the server, we can increase the batch size
  const BATCH_SIZE = 10;
  let totalItemCount = 0;

  for (let i = 0; i < workspaceFiles.length; i += BATCH_SIZE) {
    const batch = workspaceFiles.slice(i, i + BATCH_SIZE);
    const batchWrites: { path: string[]; data: Record<string, any> }[] = [];

    const results = await Promise.allSettled(
      batch.map(async file => {
        const content = await fetchDocContent(accessToken, file.id, file.mimeType);
        const comments = await fetchDocComments(accessToken, file.id);
        const cappedText = content.text.length > 900_000 ?
          content.text.slice(0, 900_000) :
          content.text;

        return {
          path: ['docs_content', file.id] as string[],
          data: {
            title: content.title,
            mimeType: file.mimeType,
            extractedText: cappedText,
            textLength: content.text.length,
            comments,
            syncedAt: new Date().toISOString(),
          },
        };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        batchWrites.push(result.value);
      }
    }

    if (batchWrites.length > 0) {
      await batchWriteUserDocs(uid, batchWrites);
      totalItemCount += batchWrites.length;
    }
  }

  await writeUserDoc(uid, ['sync_meta', 'status'], {
    docs: {
      lastSync: new Date().toISOString(),
      status: 'done',
      itemCount: totalItemCount,
    },
  });

  return totalItemCount;
}
