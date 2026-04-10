import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, readUserDoc, writeUserDoc } from '../lib/firestore';

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

// atob is available in React Native's JS runtime (Hermes/JSC)
declare function atob(data: string): string;

function decodeBase64Url(data: string): string {
    // Gmail omits base64 padding (RFC 4648 §3.2). Hermes' atob is strict and throws
    // "The specified blob is invalid" on unpadded input — add it before decoding.
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    try {
        return decodeURIComponent(
            atob(padded)
                .split('')
                .map((c: string) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join(''),
        );
    } catch {
        // decodeURIComponent can fail on non-UTF-8 sequences (e.g. binary attachments);
        // fall back to raw decoded string in that case.
        return atob(padded);
    }
}

function extractPlainText(payload: GmailMessagePart): string {
    if (payload.mimeType === 'text/plain' && payload.body.data) {
        return decodeBase64Url(payload.body.data);
    }

    if (payload.parts) {
        for (const part of payload.parts) {
            const text = extractPlainText(part);
            if (text) { return text; }
        }
    }

    // Fallback: strip HTML
    if (payload.mimeType === 'text/html' && payload.body.data) {
        const html = decodeBase64Url(payload.body.data);
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return '';
}

async function syncLabels(uid: string): Promise<number> {
    const url = buildUrl(API, '/gmail/v1/users/me/labels');
    const response = await googleFetch<GmailLabelsResponse>(url);

    if (!response.labels?.length) { return 0; }

    const writes = response.labels.map(label => ({
        // Flat 2-segment path: users/{uid}/gmail_labels/{id} = 4 total (even = valid doc ref)
        path: ['gmail_labels', label.id],
        data: { name: label.name, type: label.type },
    }));

    await batchWriteUserDocs(uid, writes);
    return writes.length;
}

async function fetchMessageDetails(
    messageId: string,
): Promise<GmailMessageResponse> {
    const url = buildUrl(API, `/gmail/v1/users/me/messages/${messageId}`, {
        format: 'full',
    });
    return googleFetch<GmailMessageResponse>(url);
}

export async function syncGmail(uid: string): Promise<number> {
    // Sync labels first
    await syncLabels(uid);

    // Determine incremental start date
    const meta = await readUserDoc(uid, ['sync_meta', 'status']);
    const lastSync = meta?.gmail?.lastSync;
    const query = lastSync
        ? `after:${new Date(lastSync).toISOString().split('T')[0].replace(/-/g, '/')}`
        : undefined;

    // Fetch message IDs with pagination
    const allMessageIds: string[] = [];
    let pageToken: string | undefined;

    do {
        const url = buildUrl(API, '/gmail/v1/users/me/messages', {
            maxResults: 100,
            q: query,
            pageToken,
        });
        const response = await googleFetch<GmailListResponse>(url);
        if (response.messages) {
            allMessageIds.push(...response.messages.map(m => m.id));
        }
        pageToken = response.nextPageToken;
    } while (pageToken);

    // Fetch message details in batches of 10
    const BATCH_SIZE = 10;
    const writes: { path: string[]; data: Record<string, any> }[] = [];

    for (let i = 0; i < allMessageIds.length; i += BATCH_SIZE) {
        const batch = allMessageIds.slice(i, i + BATCH_SIZE);
        const details = await Promise.all(batch.map(id => fetchMessageDetails(id)));

        for (const msg of details) {
            const body = extractPlainText(msg.payload);
            // Cap body to ~900KB to stay under Firestore 1MB limit
            const cappedBody = body.length > 900_000 ? body.slice(0, 900_000) : body;

            writes.push({
                // Flat 2-segment path: users/{uid}/gmail_messages/{id} = 4 total (even = valid doc ref)
                path: ['gmail_messages', msg.id],
                data: {
                    threadId: msg.threadId,
                    subject: getHeader(msg.payload.headers, 'Subject'),
                    from: getHeader(msg.payload.headers, 'From'),
                    to: getHeader(msg.payload.headers, 'To'),
                    date: getHeader(msg.payload.headers, 'Date'),
                    snippet: msg.snippet,
                    labelIds: msg.labelIds ?? [],
                    body: cappedBody,
                    internalDate: msg.internalDate,
                    syncedAt: new Date().toISOString(),
                },
            });
        }
    }

    if (writes.length > 0) {
        await batchWriteUserDocs(uid, writes);
    }

    // Save sync metadata
    await writeUserDoc(uid, ['sync_meta', 'status'], {
        gmail: {
            lastSync: new Date().toISOString(),
            status: 'done',
            itemCount: writes.length,
        },
    });

    return writes.length;
}
