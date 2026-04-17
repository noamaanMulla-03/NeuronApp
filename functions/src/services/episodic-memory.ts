import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { z } from 'genkit';
import { ai, embedder } from '../lib/genkit';
import { vertexAI } from '@genkit-ai/vertexai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationMessage {
    role: 'user' | 'assistant';
    text: string;
    sources?: string[];
    timestamp: admin.firestore.Timestamp;
}

// ---------------------------------------------------------------------------
// Conversation Persistence — called by semanticChat after each exchange
// ---------------------------------------------------------------------------

/** Save a single message to a conversation's subcollection */
export async function saveMessage(
    uid: string,
    conversationId: string,
    message: { role: 'user' | 'assistant'; text: string; sources?: string[] },
): Promise<void> {
    const db = admin.firestore();
    await db.collection(`users/${uid}/conversations/${conversationId}/messages`).add({
        ...message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/** Retrieve recent conversation messages in chronological order */
export async function getConversationHistory(
    uid: string,
    conversationId: string,
    limit = 10,
): Promise<ConversationMessage[]> {
    const db = admin.firestore();
    const snap = await db
        .collection(`users/${uid}/conversations/${conversationId}/messages`)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

    // Reverse to chronological order for prompt injection
    return snap.docs.reverse().map(d => d.data() as ConversationMessage);
}

/** Format conversation history as system prompt context */
export function formatHistoryContext(messages: ConversationMessage[]): string {
    if (messages.length === 0) return '';
    return 'PREVIOUS MESSAGES IN THIS CONVERSATION:\n' +
        messages.map(m =>
            `${m.role === 'user' ? 'User' : 'Neuron'}: ${m.text.slice(0, 300)}`
        ).join('\n') +
        '\n\nUse the above context to maintain conversational continuity.\n\n';
}

// ---------------------------------------------------------------------------
// Episodic Memory Search — vector similarity on past conversation summaries
// ---------------------------------------------------------------------------

/** Search episodic memory for relevant past conversation summaries */
export async function searchEpisodicMemory(uid: string, query: string): Promise<string> {
    try {
        const db = admin.firestore();
        // Embed the query for vector similarity
        const embedResult = await ai.embed({ embedder, content: query });
        const vector = embedResult[0].embedding;

        // Vector search on episodic_memory collection
        const snap = await db
            .collection(`users/${uid}/episodic_memory`)
            .findNearest('embedding', vector, {
                limit: 3,
                distanceMeasure: 'COSINE',
            })
            .get();

        if (snap.empty) return '';

        const memories = snap.docs.map(d => d.data().summary).filter(Boolean);
        if (memories.length === 0) return '';

        return 'RELEVANT PAST CONVERSATIONS:\n' +
            memories.map(m => `- ${m}`).join('\n') +
            '\n\n';
    } catch {
        // Non-critical — fail silently if no index or no data
        return '';
    }
}

// ---------------------------------------------------------------------------
// Scheduled Summarization — converts conversations into episodic memories
// Runs every 6 hours, processes conversations with >= 6 messages that
// haven't been summarized yet.
// ---------------------------------------------------------------------------

const MIN_MESSAGES_FOR_SUMMARY = 6;

export const summarizeConversations = onSchedule(
    {
        schedule: '0 */6 * * *',
        timeZone: 'UTC',
        timeoutSeconds: 300,
        memory: '512MiB',
    },
    async () => {
        const db = admin.firestore();
        const userRefs = await db.collection('users').listDocuments();

        logger.info('summarizeConversations: run started', { users: userRefs.length });

        let summarized = 0;

        for (const userRef of userRefs) {
            const uid = userRef.id;

            try {
                const convRefs = await db.collection(`users/${uid}/conversations`).listDocuments();

                for (const convRef of convRefs) {
                    const convId = convRef.id;

                    // Skip already-summarized conversations
                    const existing = await db
                        .collection(`users/${uid}/episodic_memory`)
                        .where('conversationId', '==', convId)
                        .limit(1)
                        .get();
                    if (!existing.empty) continue;

                    // Read all messages chronologically
                    const messages = await db
                        .collection(`users/${uid}/conversations/${convId}/messages`)
                        .orderBy('timestamp', 'asc')
                        .get();
                    if (messages.size < MIN_MESSAGES_FOR_SUMMARY) continue;

                    // Build conversation text for LLM summarization
                    const convText = messages.docs
                        .map(d => `${d.data().role}: ${d.data().text}`)
                        .join('\n')
                        .slice(0, 4000);

                    // LLM summarization + entity extraction
                    const response = await ai.generate({
                        model: vertexAI.model('gemini-2.5-flash'),
                        config: { temperature: 0 },
                        prompt:
                            'Summarize this conversation between a user and Neuron (their AI assistant). ' +
                            'Extract a 2-3 sentence summary and key entities (people, projects, topics).\n\n' +
                            convText,
                        output: {
                            schema: z.object({
                                summary: z.string(),
                                keyEntities: z.array(z.string()),
                            }),
                        },
                    });

                    const result = response.output;
                    if (!result) continue;

                    // Embed the summary for future vector retrieval
                    const embedResult = await ai.embed({ embedder, content: result.summary });
                    const embeddingVector = embedResult[0].embedding;

                    // Store the episodic memory entry with vector embedding
                    await db.collection(`users/${uid}/episodic_memory`).add({
                        summary: result.summary,
                        embedding: admin.firestore.FieldValue.vector(embeddingVector),
                        conversationId: convId,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        keyEntities: result.keyEntities,
                        messageCount: messages.size,
                    });

                    summarized++;
                    logger.info('Conversation summarized', { uid, convId });
                }
            } catch (err: any) {
                logger.error('summarizeConversations: user failed', { uid, error: err.message });
            }
        }

        logger.info('summarizeConversations: complete', { summarized });
    },
);
