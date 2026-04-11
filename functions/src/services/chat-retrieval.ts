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
    });
  }
  return _retriever;
}

// Max query length to prevent oversized embedding requests
const MAX_QUERY_LENGTH = 2000;
// Timeout for the LLM synthesis step (ms)
const SYNTHESIS_TIMEOUT_MS = 30_000;

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
    const collections = ['docs_content', 'gmail_messages', 'keep_notes', 'chat_messages'];
    const retriever = getRetriever();

    const retrievalPromises = collections.map(col =>
      ai.retrieve({
        retriever,
        query: trimmedQuery,
        options: {
          limit: 3,
          collection: `users/${uid}/${col}`,
        },
      }).catch(e => {
        // Individual collection failures are non-fatal — log and continue
        logger.warn(`Retrieval skipped for ${col}: ${safeMessage(e)}`);
        return [];
      })
    );

    const allResults = await Promise.all(retrievalPromises);
    // Filter out documents with empty text (missing embeddings, empty content, etc.)
    const docs = allResults.flat().filter(d => d.text && d.text.trim());

    // 4. Early return if no relevant documents found
    if (docs.length === 0) {
      return {
        answer:
          'I couldn\'t find any relevant data in your synced Workspace services. ' +
          'Have you synced your Gmail or Docs recently?',
        sources: [],
      };
    }

    // 5. Synthesis — generate an answer from retrieved context with a timeout guard
    const contextText = docs.map((d, i) => `[Source ${i + 1}]\n${d.text}`).join('\n\n');

    const synthesisPromise = ai.generate({
      model: vertexAI.model('gemini-2.5-flash'),
      prompt:
        'You are a proactive AI assistant. Use the following context to answer the user\'s question.\n' +
        `Context:\n${contextText}\n\n` +
        `Question: ${trimmedQuery}\n\n` +
        'If you don\'t know the answer based on the context, say you don\'t know but mention what data IS available.',
    });

    // Race the synthesis against a timeout so the function doesn't hang indefinitely
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Synthesis timed out')), SYNTHESIS_TIMEOUT_MS)
    );

    const response = await Promise.race([synthesisPromise, timeoutPromise]);

    return {
      answer: response.text,
      sources: docs.map(d => (d.text || '').substring(0, 100) + '...'),
    };
  } catch (err: unknown) {
    // Re-throw HttpsErrors as-is so the client gets the correct code
    if (err instanceof HttpsError) throw err;

    // Everything else → log full details server-side, return generic message to client
    logger.error('Semantic Chat Error:', err);
    throw new HttpsError('internal', safeMessage(err));
  }
});
