import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { z } from 'genkit';
import { ai } from '../lib/genkit';
import { vertexAI } from '@genkit-ai/vertexai';
import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { getAccessTokenForUser, GOOGLE_CLIENT_SECRET } from '../lib/oauth';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SENT_FOR_STYLE = 30;    // Emails to sample for style extraction
const MAX_STYLE_AGE_DAYS = 30;    // Re-extract style profile monthly
const MAX_DRAFT_INSTRUCTION = 1000;
const GMAIL_API = BASE_URLS.gmail;

// ---------------------------------------------------------------------------
// Style Profile Schema — persisted at users/{uid}/settings/style_profile
// ---------------------------------------------------------------------------

const StyleProfileSchema = z.object({
    tone: z.string().describe('Overall writing tone (e.g. professional, casual, concise)'),
    greetingStyle: z.string().describe('Typical opening/greeting pattern'),
    signOff: z.string().describe('Common sign-off or closing phrase'),
    formattingQuirks: z.array(z.string()).describe('Notable formatting habits'),
    averageLength: z.string().describe('Typical email length: short/medium/long'),
    vocabularyNotes: z.string().describe('Distinctive word choices or phrases'),
});

type StyleProfile = z.infer<typeof StyleProfileSchema>;

// ---------------------------------------------------------------------------
// Smart Reply Schema — 3 context-aware draft options
// ---------------------------------------------------------------------------

const SmartRepliesSchema = z.object({
    replies: z.array(z.object({
        label: z.string().describe('Short 2-3 word label: e.g. "Accept", "Decline Politely", "Ask Clarification"'),
        body: z.string().describe('Full reply email body text'),
    })).min(1).max(3),
});

// ---------------------------------------------------------------------------
// Draft Schema — single full email draft
// ---------------------------------------------------------------------------

const DraftSchema = z.object({
    subject: z.string().describe('Email subject line'),
    body: z.string().describe('Full email body text'),
});

// ---------------------------------------------------------------------------
// Style Extraction — analyses sent emails to build a voice profile
// ---------------------------------------------------------------------------

async function extractStyleProfile(uid: string): Promise<StyleProfile> {
    const db = admin.firestore();

    // Fetch user's sent emails (labelIds contains 'SENT')
    const snap = await db.collection(`users/${uid}/gmail_messages`)
        .where('labelIds', 'array-contains', 'SENT')
        .orderBy('internalDate', 'desc')
        .limit(MAX_SENT_FOR_STYLE)
        .get();

    if (snap.size < 3) {
        throw new HttpsError('failed-precondition',
            'Need at least 3 sent emails to extract your writing style. Sync more Gmail data first.');
    }

    // Build a representative sample for the LLM
    const samples = snap.docs.map(d => {
        const data = d.data();
        return `Subject: ${data.subject || '(no subject)'}\nTo: ${data.to || ''}\n\n${(data.body || data.snippet || '').slice(0, 600)}`;
    }).join('\n\n---\n\n');

    const response = await ai.generate({
        model: vertexAI.model('gemini-2.5-flash'),
        config: { temperature: 0.2 },
        prompt:
            'Analyse these sent emails from a single user and extract their writing style profile.\n' +
            'Focus on: tone, greeting patterns, sign-off phrases, formatting habits, ' +
            'typical email length, and any distinctive vocabulary or phrases.\n\n' +
            `SENT EMAILS (${snap.size} samples):\n\n${samples}`,
        output: { schema: StyleProfileSchema },
    });

    const profile = response.output;
    if (!profile) throw new HttpsError('internal', 'Style extraction failed.');

    // Persist the style profile
    await db.doc(`users/${uid}/settings/style_profile`).set({
        ...profile,
        extractedAt: new Date().toISOString(),
        sampleCount: snap.size,
    });

    logger.info('Style profile extracted', { uid, sampleCount: snap.size });
    return profile;
}

/** Get cached style profile or extract fresh one */
async function getOrExtractStyle(uid: string): Promise<StyleProfile> {
    const db = admin.firestore();
    const doc = await db.doc(`users/${uid}/settings/style_profile`).get();
    const data = doc.data();

    // Use cached profile if it exists and is recent enough
    if (data?.extractedAt) {
        const ageMs = Date.now() - new Date(data.extractedAt).getTime();
        if (ageMs < MAX_STYLE_AGE_DAYS * 24 * 60 * 60 * 1000) {
            return data as StyleProfile;
        }
    }

    return extractStyleProfile(uid);
}

/** Format a style profile as prompt context */
function styleToPrompt(style: StyleProfile): string {
    return (
        'USER WRITING STYLE PROFILE:\n' +
        `- Tone: ${style.tone}\n` +
        `- Greeting: ${style.greetingStyle}\n` +
        `- Sign-off: ${style.signOff}\n` +
        `- Length: ${style.averageLength}\n` +
        `- Vocabulary: ${style.vocabularyNotes}\n` +
        (style.formattingQuirks.length > 0
            ? `- Formatting quirks: ${style.formattingQuirks.join('; ')}\n`
            : '')
    );
}

// ---------------------------------------------------------------------------
// Cloud Function: extractStyle — manual trigger to build/rebuild profile
// ---------------------------------------------------------------------------

export const extractStyle = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    const profile = await extractStyleProfile(request.auth.uid);
    return { success: true, profile };
});

// ---------------------------------------------------------------------------
// Cloud Function: generateSmartReplies — 3 draft replies for an email
// ---------------------------------------------------------------------------

export const generateSmartReplies = onCall<{ messageId: string }>(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    const { messageId } = request.data;
    if (!messageId) throw new HttpsError('invalid-argument', 'messageId is required.');

    const uid = request.auth.uid;
    const db = admin.firestore();

    // Fetch the email to reply to
    const emailDoc = await db.doc(`users/${uid}/gmail_messages/${messageId}`).get();
    if (!emailDoc.exists) throw new HttpsError('not-found', 'Email not found.');
    const email = emailDoc.data()!;

    // Get user's writing style
    const style = await getOrExtractStyle(uid);

    const response = await ai.generate({
        model: vertexAI.model('gemini-2.5-flash'),
        prompt:
            'Generate 3 contextually appropriate reply options for this email.\n' +
            'Each reply should match the user\'s writing style and offer a distinct response approach.\n' +
            'Options should cover: positive/accepting, declining/deferring, and asking for clarification.\n' +
            'Adapt based on the email content — if it\'s informational, adjust reply types accordingly.\n\n' +
            styleToPrompt(style) + '\n' +
            `ORIGINAL EMAIL:\nFrom: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${(email.body || email.snippet || '').slice(0, 2000)}`,
        output: { schema: SmartRepliesSchema },
    });

    const result = response.output;
    if (!result) throw new HttpsError('internal', 'Smart reply generation failed.');

    return { replies: result.replies, originalSubject: email.subject };
});

// ---------------------------------------------------------------------------
// Cloud Function: generateDraft — full email from user instruction
// ---------------------------------------------------------------------------

export const generateDraft = onCall<{
    instruction: string;
    replyToId?: string;       // If replying, the original email ID
    recipientHint?: string;   // Optional recipient for new emails
}>(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

    const { instruction, replyToId, recipientHint } = request.data;
    if (!instruction?.trim()) throw new HttpsError('invalid-argument', 'Instruction is required.');
    if (instruction.length > MAX_DRAFT_INSTRUCTION) {
        throw new HttpsError('invalid-argument', `Instruction too long (max ${MAX_DRAFT_INSTRUCTION} chars).`);
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    const style = await getOrExtractStyle(uid);

    // Build context from the original email if this is a reply
    let replyContext = '';
    if (replyToId) {
        const emailDoc = await db.doc(`users/${uid}/gmail_messages/${replyToId}`).get();
        if (emailDoc.exists) {
            const email = emailDoc.data()!;
            replyContext =
                `\nREPLYING TO:\nFrom: ${email.from}\nSubject: ${email.subject}\n` +
                `Date: ${email.date}\n\n${(email.body || email.snippet || '').slice(0, 2000)}\n`;
        }
    }

    const response = await ai.generate({
        model: vertexAI.model('gemini-2.5-flash'),
        prompt:
            'Generate a complete email draft based on the user\'s instruction.\n' +
            'Match the user\'s writing style precisely. Write in plain text only.\n' +
            'If this is a reply, ensure the subject line has the appropriate "Re: " prefix.\n' +
            'If composing a new email, create an appropriate subject line.\n\n' +
            styleToPrompt(style) +
            replyContext +
            (recipientHint ? `\nRecipient: ${recipientHint}\n` : '') +
            `\nUSER INSTRUCTION: ${instruction.trim()}`,
        output: { schema: DraftSchema },
    });

    const draft = response.output;
    if (!draft) throw new HttpsError('internal', 'Draft generation failed.');

    return { draft };
});

// ---------------------------------------------------------------------------
// Cloud Function: sendDraft — creates a Gmail draft via the Gmail API
// ---------------------------------------------------------------------------

export const sendDraft = onCall<{
    to: string;
    subject: string;
    body: string;
    threadId?: string;  // Set when replying to keep the thread together
}>(
    { secrets: [GOOGLE_CLIENT_SECRET] },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

        const { to, subject, body, threadId } = request.data;
        if (!to || !subject || !body) {
            throw new HttpsError('invalid-argument', 'to, subject, and body are required.');
        }

        const uid = request.auth.uid;
        const accessToken = await getAccessTokenForUser(uid);

        // Construct RFC 2822 formatted message
        const rawParts = [
            `To: ${to}`,
            `Subject: ${subject}`,
            'Content-Type: text/plain; charset=UTF-8',
            '',
            body,
        ];
        const raw = Buffer.from(rawParts.join('\r\n')).toString('base64url');

        // Create a Gmail draft (not send directly — user reviews first)
        const draftPayload: any = { message: { raw } };
        if (threadId) draftPayload.message.threadId = threadId;

        const url = buildUrl(GMAIL_API, '/gmail/v1/users/me/drafts');
        const result = await googleFetch<{ id: string; message: { id: string } }>(
            accessToken, url,
            { method: 'POST', body: JSON.stringify(draftPayload) },
        );

        logger.info('Gmail draft created', { uid, draftId: result.id });
        return { success: true, draftId: result.id };
    },
);

// ---------------------------------------------------------------------------
// Scheduled: refreshStyleProfiles — monthly re-extraction for all users
// ---------------------------------------------------------------------------

export const refreshStyleProfiles = onSchedule(
    {
        schedule: '0 3 1 * *', // 1st of each month at 3 AM UTC
        timeZone: 'UTC',
        timeoutSeconds: 300,
        memory: '512MiB',
    },
    async () => {
        const db = admin.firestore();
        const userRefs = await db.collection('users').listDocuments();

        let refreshed = 0;
        for (const userRef of userRefs) {
            const uid = userRef.id;
            try {
                // Only refresh if user has sent emails synced
                const sentCheck = await db.collection(`users/${uid}/gmail_messages`)
                    .where('labelIds', 'array-contains', 'SENT')
                    .limit(3)
                    .get();
                if (sentCheck.size < 3) continue;

                await extractStyleProfile(uid);
                refreshed++;
            } catch (err: any) {
                logger.warn('Style refresh failed', { uid, error: err.message });
            }
        }

        logger.info('refreshStyleProfiles complete', { refreshed });
    },
);
