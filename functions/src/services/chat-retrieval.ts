import { ai, getFirestore, embedder } from '../lib/genkit';
import { defineFirestoreRetriever } from '@genkit-ai/firebase';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { vertexAI } from '@genkit-ai/vertexai';
import type { RetrieverAction } from 'genkit';

// Extracts a safe string message from any thrown value — never throws itself.
function safeMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return 'Unknown error'; }
}

// Lazily initialized retriever — avoids module-level crash if Firestore
// or Genkit plugins aren't ready during cold start.
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
      // Return distance so we can log it and source-type metadata for rich citations
      distanceResultField: '_distance',
      metadataFields: ['title', 'subject', 'from', 'to', 'date', 'body', 'extractedText'],
    });
  }
  return _retriever;
}

// Max query length to prevent oversized embedding requests
const MAX_QUERY_LENGTH = 2000;
// Timeout for the LLM synthesis step (ms)
const SYNTHESIS_TIMEOUT_MS = 30_000;
// Cosine distance threshold — documents more distant than this are irrelevant.
// Cosine distance = 1 - cosine_similarity; 0 = identical, 2 = opposite.
// 0.65 keeps only meaningfully related results.
const DISTANCE_THRESHOLD = 0.65;

// Human-readable label for each collection
const COLLECTION_LABELS: Record<string, string> = {
  docs_content: 'Document',
  gmail_messages: 'Email',
  keep_notes: 'Note',
  chat_messages: 'Chat Message',
};

// Derives a short, readable citation from retriever metadata + collection type
function buildSourceCitation(meta: Record<string, any> | undefined, collection: string): string {
  const type = COLLECTION_LABELS[collection] || 'Source';

  if (collection === 'gmail_messages') {
    const subject = meta?.subject || 'No subject';
    const from = meta?.from || '';
    // "Email: Weekly standup — from alice@company.com"
    return `${type}: ${subject}${from ? ` — from ${from}` : ''}`;
  }

  if (collection === 'docs_content') {
    return `${type}: ${meta?.title || 'Untitled'}`;
  }

  if (collection === 'keep_notes') {
    return `${type}: ${meta?.title || 'Untitled note'}`;
  }

  return type;
}

export const semanticChat = onCall<{ query: string }>(async request => {
  // Entire body wrapped in try-catch so NO error escapes as a bare "internal"
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

    // Cap query length to avoid oversized embedding calls
    const trimmedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);

    logger.info(`Semantic Chat query for user ${uid}`);

    // 3. Parallel retrieval across all indexed collections
    // Each retrieval embeds the query once and searches the collection's vector index.
    // distanceThreshold filters out irrelevant results at the database level.
    const collections = ['docs_content', 'gmail_messages', 'keep_notes', 'chat_messages'];
    const retriever = getRetriever();

    const retrievalPromises = collections.map(col =>
      ai.retrieve({
        retriever,
        query: trimmedQuery,
        options: {
          limit: 5,
          collection: `users/${uid}/${col}`,
          distanceThreshold: DISTANCE_THRESHOLD,
        },
      })
        // Tag each result with its source collection for citation building
        .then(results => results.map(d => ({ doc: d, collection: col })))
        .catch(e => {
          // Individual collection failures are non-fatal — log and continue
          logger.warn(`Retrieval skipped for ${col}: ${safeMessage(e)}`);
          return [] as { doc: any; collection: string }[];
        })
    );

    const allResults = (await Promise.all(retrievalPromises)).flat();
    // Filter out documents with empty text (missing embeddings, empty content, etc.)
    const relevant = allResults.filter(r => r.doc.text && r.doc.text.trim());

    // 4. Early return if no relevant documents found
    if (relevant.length === 0) {
      return {
        answer:
          'I couldn\'t find any relevant data in your synced Workspace services. ' +
          'Have you synced your Gmail or Docs recently?',
        sources: [],
      };
    }

    // 5. Build structured context for the LLM — each source gets a typed header
    //    so the model understands what kind of data it's looking at.
    const contextBlocks = relevant.map((r, i) => {
      const citation = buildSourceCitation(r.doc.metadata, r.collection);
      return `[Source ${i + 1} — ${citation}]\n${r.doc.text}`;
    });

    // 6. Synthesis — generate an answer with a timeout guard
    const synthesisPromise = ai.generate({
      model: vertexAI.model('gemini-2.5-flash'),
      prompt:
        'You are Neuron, a proactive AI assistant that understands the user\'s digital workspace.\n' +
        'You have access to their synced Google Workspace data (Emails, Documents, Notes, Chat).\n\n' +
        'INSTRUCTIONS:\n' +
        '- Answer the user\'s question using ONLY the context provided below.\n' +
        '- Cite sources by number (e.g. [1], [2]) when referencing specific information.\n' +
        '- Structure your response clearly: use short paragraphs for readability.\n' +
        '- If the context doesn\'t contain an answer, say so and describe what data IS available.\n' +
        '- Be concise — prioritize the most relevant information.\n\n' +
        `CONTEXT (${relevant.length} sources):\n\n` +
        contextBlocks.join('\n\n---\n\n') + '\n\n' +
        `USER QUESTION: ${trimmedQuery}`,
    });

    // Race the synthesis against a timeout so the function doesn't hang indefinitely
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Synthesis timed out')), SYNTHESIS_TIMEOUT_MS)
    );

    const response = await Promise.race([synthesisPromise, timeoutPromise]);

    // 7. Build readable source citations for the client
    const sources = relevant.map(r => buildSourceCitation(r.doc.metadata, r.collection));

    return {
      answer: response.text,
      sources,
    };
  } catch (err: unknown) {
    // Re-throw HttpsErrors as-is so the client gets the correct code
    if (err instanceof HttpsError) throw err;

    // Everything else → log full details server-side, return generic message to client
    logger.error('Semantic Chat Error:', err);
    throw new HttpsError('internal', safeMessage(err));
  }
});
