import { genkit } from 'genkit';
import { vertexAI } from '@genkit-ai/vertexai';
import * as admin from 'firebase-admin';

// Initialize Genkit with Vertex AI plugin
export const ai = genkit({
  plugins: [
    vertexAI({
      location: 'us-central1',
      projectId: 'neuron-bb594',
    }),
  ],
});

// Lazy Firestore getter — avoids cold-start crash if admin.initializeApp()
// hasn't run yet when this module is first imported.
let _firestore: admin.firestore.Firestore | null = null;
export function getFirestore(): admin.firestore.Firestore {
  if (!_firestore) _firestore = admin.firestore();
  return _firestore;
}

export const embedder = vertexAI.embedder('text-embedding-004');
