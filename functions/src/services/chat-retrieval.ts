import { z } from 'genkit';
import { ai, getFirestore, embedder } from '../lib/genkit';
import { defineFirestoreRetriever } from '@genkit-ai/firebase';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { vertexAI } from '@genkit-ai/vertexai';
import * as admin from 'firebase-admin';
import type { RetrieverAction, MessageData } from 'genkit';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Extracts a safe string message from any thrown value — never throws itself. */
function safeMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Unknown error'; }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_QUERY_LENGTH = 2000;
const SYNTHESIS_TIMEOUT_MS = 45_000; // Higher than before — accounts for multi-turn tool loops
const DISTANCE_THRESHOLD = 0.65;
const MAX_REACT_TURNS = 5;
const RERANK_RELEVANCE_THRESHOLD = 6; // Min score (0-10) to keep after LLM reranking
const MAX_RERANKED_RESULTS = 5;

// Collections that have Firestore vector indexes (768-dim, flat, COSINE)
const VECTOR_COLLECTIONS = ['docs_content', 'gmail_messages', 'keep_notes', 'chat_messages'] as const;

// Human-readable label per collection — used in citations
const COLLECTION_LABELS: Record<string, string> = {
    docs_content: 'Document',
    gmail_messages: 'Email',
    keep_notes: 'Note',
    chat_messages: 'Chat Message',
};

// ---------------------------------------------------------------------------
// Retriever (lazy singleton — avoids cold-start crash)
// ---------------------------------------------------------------------------

let _retriever: RetrieverAction | null = null;
function getRetriever(): RetrieverAction {
    if (!_retriever) {
        _retriever = defineFirestoreRetriever(ai, {
            name: 'genericRetriever',
            firestore: getFirestore(),
            collection: 'dummy', // Overridden per-query via options.collection
            contentField: 'embeddingText',
            vectorField: 'embedding',
            embedder,
            distanceMeasure: 'COSINE',
            distanceResultField: '_distance',
            metadataFields: ['title', 'subject', 'from', 'to', 'date', 'body', 'extractedText'],
        });
    }
    return _retriever;
}

// ---------------------------------------------------------------------------
// Source citation builder (shared by RAG pipeline and direct lookups)
// ---------------------------------------------------------------------------

function buildSourceCitation(meta: Record<string, any> | undefined, collection: string): string {
    const type = COLLECTION_LABELS[collection] || 'Source';
    if (collection === 'gmail_messages') {
        const subject = meta?.subject || 'No subject';
        const from = meta?.from || '';
        return `${type}: ${subject}${from ? ` — from ${from}` : ''}`;
    }
    if (collection === 'docs_content') return `${type}: ${meta?.title || 'Untitled'}`;
    if (collection === 'keep_notes') return `${type}: ${meta?.title || 'Untitled note'}`;
    return type;
}

// ---------------------------------------------------------------------------
// Multi-Stage RAG: Query Expansion → Parallel Retrieval → LLM Reranking
// ---------------------------------------------------------------------------

/** Tagged retrieval result carrying text, collection origin, and citation. */
interface TaggedResult {
    text: string;
    citation: string;
    collection: string;
    meta: Record<string, any>;
}

/**
 * Stage 1 — Query Expansion.
 * LLM generates 2-3 semantically diverse search queries from the user's
 * original query, each targeting a different angle for better recall.
 */
async function expandQuery(originalQuery: string): Promise<string[]> {
    const response = await ai.generate({
        model: vertexAI.model('gemini-2.5-flash'),
        config: { temperature: 0.3 },
        prompt:
            'Generate 3 short, specific search queries optimised for semantic vector retrieval ' +
            'across emails, documents, notes, and calendar data.\n' +
            'Each query should capture a different angle or aspect of the user\'s intent.\n' +
            'Return ONLY a JSON array of strings — no explanation.\n\n' +
            `User query: "${originalQuery}"`,
        output: {
            schema: z.array(z.string().describe('A search query variant')).min(1).max(3),
        },
    });
    const expanded = response.output;
    return expanded && expanded.length > 0 ? expanded : [originalQuery];
}

/**
 * Stage 2 — Multi-Query Retrieval.
 * Fires (expanded queries × collections) in parallel, then deduplicates
 * results by a composite key to avoid showing the same doc twice.
 */
async function multiQueryRetrieve(queries: string[], uid: string): Promise<TaggedResult[]> {
    const retriever = getRetriever();

    // All (query × collection) retrieval calls in parallel
    const promises = queries.flatMap(q =>
        VECTOR_COLLECTIONS.map(col =>
            ai.retrieve({
                retriever,
                query: q,
                options: { limit: 5, collection: `users/${uid}/${col}`, distanceThreshold: DISTANCE_THRESHOLD },
            })
                .then(results => results.map(d => ({
                    text: d.text || '',
                    collection: col,
                    meta: d.metadata || {},
                    _dedup: `${col}:${d.metadata?.['title'] || d.metadata?.['subject'] || d.text?.slice(0, 80)}`,
                })))
                .catch(e => {
                    logger.warn(`Retrieval skipped for ${col} (query: "${q.slice(0, 50)}"): ${safeMessage(e)}`);
                    return [] as any[];
                })
        )
    );

    const all = (await Promise.all(promises)).flat();

    // Deduplicate — keep first occurrence (highest relevance from tighter query)
    const seen = new Set<string>();
    const deduped: TaggedResult[] = [];
    for (const r of all) {
        if (!r.text.trim() || seen.has(r._dedup)) continue;
        seen.add(r._dedup);
        deduped.push({
            text: r.text,
            collection: r.collection,
            meta: r.meta,
            citation: buildSourceCitation(r.meta, r.collection),
        });
    }
    return deduped;
}

/**
 * Stage 3 — LLM Reranking.
 * Scores each candidate's relevance to the original query, filters below
 * threshold, and returns the top N results sorted by score.
 */
async function rerankResults(originalQuery: string, candidates: TaggedResult[]): Promise<TaggedResult[]> {
    // Skip reranking when candidate count is already within the cap
    if (candidates.length <= MAX_RERANKED_RESULTS) return candidates;

    const RerankSchema = z.array(z.object({
        index: z.number().describe('Zero-based index of the document'),
        score: z.number().describe('Relevance score from 0 (irrelevant) to 10 (perfect match)'),
    }));

    const response = await ai.generate({
        model: vertexAI.model('gemini-2.5-flash'),
        config: { temperature: 0 },
        prompt:
            `Score each document's relevance to the query: "${originalQuery}"\n` +
            'Return a JSON array of {index, score} sorted by score descending.\n' +
            'Score 0 = completely irrelevant, 10 = perfect match.\n\n' +
            candidates.map((c, i) => `[${i}] ${c.citation}\n${c.text.slice(0, 400)}`).join('\n\n'),
        output: { schema: RerankSchema },
    });

    const ranked = response.output;
    if (!ranked || ranked.length === 0) return candidates.slice(0, MAX_RERANKED_RESULTS);

    return ranked
        .filter(r => r.score >= RERANK_RELEVANCE_THRESHOLD && r.index < candidates.length)
        .slice(0, MAX_RERANKED_RESULTS)
        .map(r => candidates[r.index]);
}

/**
 * Full multi-stage RAG pipeline: expand → retrieve → rerank.
 * Returns formatted context blocks and deduplicated source citations.
 */
async function multiStageRAG(query: string, uid: string): Promise<{ context: string; sources: string[] }> {
    const expanded = await expandQuery(query);
    logger.info(`Query expanded to ${expanded.length} variants`, { expanded });

    const candidates = await multiQueryRetrieve(expanded, uid);
    logger.info(`Retrieved ${candidates.length} unique candidates`);

    if (candidates.length === 0) return { context: '', sources: [] };

    const reranked = await rerankResults(query, candidates);
    logger.info(`Reranked to ${reranked.length} results`);

    const context = reranked
        .map((r, i) => `[Source ${i + 1} — ${r.citation}]\n${r.text}`)
        .join('\n\n---\n\n');

    return { context, sources: reranked.map(r => r.citation) };
}

// ---------------------------------------------------------------------------
// ReAct Agent Tools — Genkit auto-resolves these in its internal loop
// ---------------------------------------------------------------------------

// Per-request source accumulator — reset at the start of each Cloud Function call
let _requestSources: string[] = [];

/** Tool: searchWorkspace — full multi-stage RAG over indexed GSuite data. */
const searchWorkspace = ai.defineTool(
    {
        name: 'searchWorkspace',
        description:
            'Search the user\'s synced Google Workspace data (emails, documents, notes, chat) ' +
            'using semantic similarity. Use this when you need to find information from the user\'s data.',
        inputSchema: z.object({
            query: z.string().describe('The search query — be specific and descriptive'),
        }),
        outputSchema: z.string().describe('Retrieved context with numbered source citations'),
    },
    async (input, { context }) => {
        const uid = context?.auth?.uid as string;
        if (!uid) return 'Error: no authenticated user.';

        const { context: ctx, sources } = await multiStageRAG(input.query, uid);
        if (!ctx) return 'No relevant results found for this query.';

        _requestSources.push(...sources);
        return ctx;
    }
);

/** Tool: getCalendarEvents — reads synced calendar events for a date. */
const getCalendarEvents = ai.defineTool(
    {
        name: 'getCalendarEvents',
        description:
            'Get the user\'s calendar events for a specific date. ' +
            'Use when the user asks about their schedule, meetings, or availability.',
        inputSchema: z.object({
            date: z.string().describe('Date in YYYY-MM-DD format'),
        }),
        outputSchema: z.string().describe('Formatted list of calendar events'),
    },
    async (input, { context }) => {
        const uid = context?.auth?.uid as string;
        if (!uid) return 'Error: no authenticated user.';

        const db = admin.firestore();
        const snapshot = await db.collection(`users/${uid}/calendar_events`).get();

        // Filter events matching the requested date
        const events = snapshot.docs.filter(d => {
            const s = d.data().start;
            if (!s) return false;
            if (s.dateTime) return s.dateTime.startsWith(input.date);
            return s.date === input.date;
        });

        if (events.length === 0) return `No events found for ${input.date}.`;

        return events.map(d => {
            const data = d.data();
            const time = data.start?.dateTime
                ? new Date(data.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : 'All day';
            const attendees = (data.attendees ?? []).length;
            return `• ${data.summary || 'Untitled'} — ${time}` +
                (attendees > 1 ? ` (${attendees} attendees)` : '') +
                (data.hangoutLink ? ' [video call]' : '');
        }).join('\n');
    }
);

/** Tool: getTasksByStatus — reads synced Google Tasks by completion status. */
const getTasksByStatus = ai.defineTool(
    {
        name: 'getTasksByStatus',
        description:
            'Get the user\'s Google Tasks filtered by status. ' +
            'Use when the user asks about to-dos, pending tasks, or completed items.',
        inputSchema: z.object({
            status: z.enum(['needsAction', 'completed']).describe('Task status to filter by'),
        }),
        outputSchema: z.string().describe('Formatted list of tasks'),
    },
    async (input, { context }) => {
        const uid = context?.auth?.uid as string;
        if (!uid) return 'Error: no authenticated user.';

        const db = admin.firestore();
        const snapshot = await db.collection(`users/${uid}/tasks_items`)
            .where('status', '==', input.status)
            .limit(15)
            .get();

        if (snapshot.empty) return `No ${input.status === 'needsAction' ? 'pending' : 'completed'} tasks found.`;

        return snapshot.docs.map(d => {
            const data = d.data();
            const due = data.due ? ` (due ${data.due.slice(0, 10)})` : '';
            return `• ${data.title || 'Untitled'}${due}`;
        }).join('\n');
    }
);

/** Tool: getEmailDetail — retrieves specific emails by subject keyword search. */
const getEmailDetail = ai.defineTool(
    {
        name: 'getEmailDetail',
        description:
            'Search for and retrieve a specific email by subject keywords. ' +
            'Use when the user asks about a specific email or thread.',
        inputSchema: z.object({
            subjectKeywords: z.string().describe('Keywords to search for in email subjects'),
        }),
        outputSchema: z.string().describe('Email details: subject, sender, date, body excerpt'),
    },
    async (input, { context }) => {
        const uid = context?.auth?.uid as string;
        if (!uid) return 'Error: no authenticated user.';

        const db = admin.firestore();
        const snapshot = await db.collection(`users/${uid}/gmail_messages`).limit(100).get();

        // Filter by subject keywords in JS (Firestore lacks full-text search)
        const keywords = input.subjectKeywords.toLowerCase().split(/\s+/);
        const matches = snapshot.docs.filter(d => {
            const subject = (d.data().subject || '').toLowerCase();
            return keywords.every(kw => subject.includes(kw));
        });

        if (matches.length === 0) return `No emails found matching "${input.subjectKeywords}".`;

        return matches.slice(0, 3).map(d => {
            const data = d.data();
            const body = (data.body || data.snippet || '').slice(0, 500);
            return `Subject: ${data.subject}\nFrom: ${data.from}\nDate: ${data.date}\n\n${body}`;
        }).join('\n\n---\n\n');
    }
);

// All tools exposed to the ReAct agent
const AGENT_TOOLS = [searchWorkspace, getCalendarEvents, getTasksByStatus, getEmailDetail];

// ---------------------------------------------------------------------------
// ReAct Reasoning Trace Extraction
// ---------------------------------------------------------------------------

/** A single step in the agent's reasoning chain — sent to the frontend. */
interface ReActStep {
    type: 'thought' | 'action' | 'observation' | 'finalAnswer';
    text: string;
    tool?: string;
    toolInput?: Record<string, any>;
}

/**
 * Extracts a human-readable reasoning trace from Genkit's auto-resolved
 * message history. Model messages become thoughts/actions; tool messages
 * become observations.
 */
function extractReasoningTrace(messages: MessageData[]): ReActStep[] {
    const steps: ReActStep[] = [];

    for (const msg of messages) {
        // Skip system/user messages — only model and tool carry reasoning
        if (msg.role === 'system' || msg.role === 'user') continue;

        for (const part of msg.content) {
            if ('text' in part && part.text && msg.role === 'model') {
                steps.push({ type: 'thought', text: part.text });
            }
            if ('toolRequest' in part && part.toolRequest) {
                steps.push({
                    type: 'action',
                    text: `Calling ${part.toolRequest.name}`,
                    tool: part.toolRequest.name,
                    toolInput: part.toolRequest.input as Record<string, any>,
                });
            }
            if ('toolResponse' in part && part.toolResponse) {
                const output = typeof part.toolResponse.output === 'string'
                    ? part.toolResponse.output
                    : JSON.stringify(part.toolResponse.output);
                // Truncate verbose observations for the client payload
                steps.push({
                    type: 'observation',
                    text: output.length > 600 ? output.slice(0, 600) + '…' : output,
                });
            }
        }
    }

    return steps;
}

// ---------------------------------------------------------------------------
// System Prompt — enforces ReAct reasoning pattern
// ---------------------------------------------------------------------------

// Built at invocation time so the model always knows "today"
function buildSystemPrompt(): string {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });

    return (
        'You are Neuron, a proactive AI assistant with deep access to the user\'s Google Workspace.\n\n' +
        `TODAY: ${dayName}, ${isoDate}.\n` +
        'When the user says "today", "yesterday", "3 days ago", "next week", etc., ' +
        'resolve the relative reference to a concrete YYYY-MM-DD date BEFORE calling any tool.\n\n' +
        'REASONING PROTOCOL (ReAct):\n' +
        '1. THINK: Before each action, briefly state what information you need and why.\n' +
        '2. ACT: Call the most appropriate tool to gather that information.\n' +
        '3. OBSERVE: Analyse the tool output to determine if you have enough context.\n' +
        '4. Repeat steps 1-3 until you can provide a complete, grounded answer.\n\n' +
        'RESPONSE RULES:\n' +
        '- Ground ALL claims in tool-retrieved data — never fabricate information.\n' +
        '- Cite sources by number (e.g. [1], [2]) when referencing specific data.\n' +
        '- Be concise and actionable — prioritise the most relevant information.\n' +
        '- If tools return no relevant data, say so honestly.\n' +
        '- Use plain text only — no markdown formatting (no *, **, #, etc.).\n' +
        '- Structure your final answer clearly with short paragraphs.'
    );
}

// ---------------------------------------------------------------------------
// Cloud Function: semanticChat
// ---------------------------------------------------------------------------

export const semanticChat = onCall<{ query: string }>(async request => {
    try {
        // 1. Auth gate
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be logged in.');
        }

        const query = request.data?.query;
        const uid = request.auth.uid;

        // 2. Input validation
        if (!query || typeof query !== 'string' || !query.trim()) {
            throw new HttpsError('invalid-argument', 'Query is required.');
        }

        const trimmedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);
        logger.info(`Semantic Chat query for user ${uid}`);

        // Reset per-request source accumulator
        _requestSources = [];

        // 3. ReAct agent — Genkit auto-resolves tool calls in a loop (up to maxTurns).
        //    The model decides which tools to call based on the system prompt.
        //    Each tool call and its result are appended to the internal message
        //    history, forming the Thought → Action → Observation chain.
        const generatePromise = ai.generate({
            model: vertexAI.model('gemini-2.5-flash'),
            system: buildSystemPrompt(),
            prompt: trimmedQuery,
            tools: AGENT_TOOLS,
            maxTurns: MAX_REACT_TURNS,
            context: { auth: { uid } }, // Passed through to tool callbacks
        });

        // Race against timeout to prevent indefinite hangs
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Agent timed out')), SYNTHESIS_TIMEOUT_MS)
        );

        const response = await Promise.race([generatePromise, timeoutPromise]);

        // 4. Extract the full reasoning trace from Genkit's message history
        const steps = extractReasoningTrace(response.messages);
        steps.push({ type: 'finalAnswer', text: response.text });

        // 5. Deduplicate accumulated sources from tool calls
        const sources = [...new Set(_requestSources)];

        return { steps, answer: response.text, sources };
    } catch (err: unknown) {
        if (err instanceof HttpsError) throw err;
        logger.error('Semantic Chat Error:', err);
        throw new HttpsError('internal', safeMessage(err));
    }
});
