import * as admin from 'firebase-admin';
import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from './firestore';

const API = BASE_URLS.gmail;

interface GmailLabel {
    id: string;
    name: string;
    type: string;
}

interface GmailMessageHeader {
    name: string;
    value: string;
}

interface GmailMessagePart {
    mimeType: string;
    body: { data?: string; size: number };
    parts?: GmailMessagePart[];
}

interface GmailMessageResponse {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    internalDate: string;
    payload: {
        headers: GmailMessageHeader[];
        mimeType: string;
        body: { data?: string; size: number };
        parts?: GmailMessagePart[];
    };
}

interface GmailListResponse {
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
}

interface GmailLabelsResponse {
    labels: GmailLabel[];
}

function getHeader(headers: GmailMessageHeader[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64').toString('utf8');
}

function extractPlainText(payload: GmailMessagePart): string {
  if (payload.mimeType === 'text/plain' && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) {
        return text;
      }
    }
  }

  // Fallback: strip HTML
  if (payload.mimeType === 'text/html' && payload.body.data) {
    const html = decodeBase64Url(payload.body.data);
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return '';
}

async function syncLabels(accessToken: string, uid: string): Promise<number> {
  const url = buildUrl(API, '/gmail/v1/users/me/labels');
  const response = await googleFetch<GmailLabelsResponse>(accessToken, url);

  if (!response.labels?.length) {
    return 0;
  }

  const writes = response.labels.map(label => ({
    path: ['gmail_labels', label.id],
    data: { name: label.name, type: label.type },
  }));

  await batchWriteUserDocs(uid, writes);
  return writes.length;
}

async function fetchMessageDetails(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageResponse> {
  const url = buildUrl(API, `/gmail/v1/users/me/messages/${messageId}`, {
    format: 'full',
    fields: 'id,threadId,labelIds,snippet,internalDate,payload(headers,mimeType,body,parts)',
  });
  return googleFetch<GmailMessageResponse>(accessToken, url);
}

export async function syncGmail(accessToken: string, uid: string): Promise<number> {
  // Sync labels first
  await syncLabels(accessToken, uid);

  // Determine incremental start date
  const db = admin.firestore();
  const metaRef = db.doc(`users/${uid}/sync_meta/status`);
  const metaDoc = await metaRef.get();
  const metaData = metaDoc.data();

  const lastSync = metaData?.gmail?.lastSync;
  const query = lastSync ?
    `after:${new Date(lastSync).toISOString().split('T')[0].replace(/-/g, '/')}` :
    undefined;

  let totalItemCount = 0;
  let pageToken: string | undefined;

  do {
    const url = buildUrl(API, '/gmail/v1/users/me/messages', {
      maxResults: 100,
      q: query,
      pageToken,
    });
    const response = await googleFetch<GmailListResponse>(accessToken, url);

    if (response.messages && response.messages.length > 0) {
      const messageIds = response.messages.map(m => m.id);

      // On the server, we can handle larger batches safely
      const DETAIL_BATCH_SIZE = 10;
      for (let i = 0; i < messageIds.length; i += DETAIL_BATCH_SIZE) {
        const subBatch = messageIds.slice(i, i + DETAIL_BATCH_SIZE);
        const details = await Promise.all(subBatch.map(id => fetchMessageDetails(accessToken, id)));

        const writes = details.map(msg => {
          const body = extractPlainText(msg.payload);
          const cappedBody = body.length > 900_000 ? body.slice(0, 900_000) : body;

          const labelIds = msg.labelIds ?? [];
          const isImportant = labelIds.includes('IMPORTANT');
          const categoryLabel = labelIds.find(l => l.startsWith('CATEGORY_'));
          const category = categoryLabel ? categoryLabel.replace('CATEGORY_', '') : null;

          return {
            path: ['gmail_messages', msg.id],
            data: {
              threadId: msg.threadId,
              subject: getHeader(msg.payload.headers, 'Subject'),
              from: getHeader(msg.payload.headers, 'From'),
              to: getHeader(msg.payload.headers, 'To'),
              date: getHeader(msg.payload.headers, 'Date'),
              snippet: msg.snippet,
              labelIds: labelIds,
              isImportant,
              category,
              body: cappedBody,
              internalDate: msg.internalDate,
              syncedAt: new Date().toISOString(),
            },
          };
        });

        await batchWriteUserDocs(uid, writes);
        totalItemCount += writes.length;
      }
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  // Save sync metadata
  await writeUserDoc(uid, ['sync_meta', 'status'], {
    gmail: {
      lastSync: new Date().toISOString(),
      status: 'done',
      itemCount: totalItemCount,
    },
  });

  return totalItemCount;
}
