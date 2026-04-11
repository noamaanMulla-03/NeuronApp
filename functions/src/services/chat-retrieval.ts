import { genkit } from 'genkit';
import { vertexAI } from '@genkit-ai/google-genai';
import { defineFirestoreRetriever } from '@genkit-ai/firebase';
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

const ai = genkit({
  plugins: [vertexAI({ location: 'us-central1' })],
});

const firestore = admin.firestore();
const embedder = vertexAI.embedder('text-embedding-004');

// Generic retriever using the common embeddingText field
const genericRetriever = defineFirestoreRetriever(ai, {
  name: 'genericRetriever',
  firestore,
  collection: 'dummy', // Overridden at runtime
  contentField: 'embeddingText',
  vectorField: 'embedding',
  embedder,
  distanceMeasure: 'COSINE',
});

// Since onCallGenkit has no auth protections easily accessible without custom middleware,
// we will use standard Firebase onCall, verify auth, and run ai.generate manually.
export const semanticChat = onCall<{ query: string }>(async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in.');
  }

  const { query } = request.data;
  const uid = request.auth.uid;

  if (!query) {
    throw new HttpsError('invalid-argument', 'Query is required.');
  }

  logger.info(`Starting semantic chat for user ${uid}`, { query });

  // Retrieve across all core collections
  const collections = ['docs_content', 'gmail_messages', 'keep_notes', 'chat_messages'];

  // Run retrievals in parallel
  const retrievalPromises = collections.map(col =>
    ai.retrieve({
      retriever: genericRetriever,
      query,
      options: {
        limit: 3,
        collection: `users/${uid}/${col}`,
      },
    }).catch(e => {
      // It's expected to fail if the collection doesn't exist or isn't indexed yet
      logger.warn(`Retrieval failed for ${col}`, e);
      return [];
    })
  );

  const results = await Promise.all(retrievalPromises);
  const allDocs = results.flat();

  // Construct context
  const contextText = allDocs.map((doc, index) => {
    // Genkit Documents have a .text property
    return `--- Document ${index + 1} ---\n${doc.text || ''}\n`;
  }).join('\n');

  const prompt = [
    'You are a proactive AI assistant. Use the provided context from the',
    'user\'s digital life to answer their question. If the answer is not in',
    'the context, say you don\'t know based on the synced data.',
    '',
    'Context:',
    contextText,
    '',
    `Question: ${query}`,
  ].join('\n');

  try {
    const response = await ai.generate({
      model: vertexAI.model('gemini-2.5-flash'),
      prompt,
    });

    return {
      answer: response.text,
      sources: allDocs.map(d => (d.text || '').substring(0, 100) + '...'),
    };
  } catch (error: any) {
    logger.error('Failed to generate semantic response', error);
    throw new HttpsError('internal', 'Failed to generate response.', error.message);
  }
});
