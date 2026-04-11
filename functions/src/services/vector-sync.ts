import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';
import * as logger from 'firebase-functions/logger';
import { genkit } from 'genkit';
import { vertexAI } from '@genkit-ai/google-genai';

const ai = genkit({
  plugins: [vertexAI({ location: 'us-central1' })],
});

interface EmbedTaskPayload {
  docPath: string;
  text: string;
}

// 1. The Task Processor
export const processEmbedding = onTaskDispatched<EmbedTaskPayload>(
  {
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 60,
    },
    rateLimits: {
      maxConcurrentDispatches: 10,
    },
  },
  async req => {
    const { docPath, text } = req.data;
    if (!text || !docPath) return;

    try {
      logger.info(`Generating embedding for ${docPath}`);
      const embeddings = await ai.embed({
        embedder: vertexAI.embedder('text-embedding-004'),
        content: text,
      });

      const embeddingVector = embeddings[0].embedding;

      // Save back to Firestore
      await admin.firestore().doc(docPath).update({
        embedding: admin.firestore.FieldValue.vector(embeddingVector),
        embeddingText: text,
      });
      logger.info(`Successfully embedded ${docPath}`);
    } catch (error: any) {
      logger.error(`Failed to embed ${docPath}`, error);
      throw error; // Trigger retry
    }
  }
);

// Helper to enqueue task
async function enqueueEmbeddingTask(docPath: string, text: string) {
  // Use the default location 'us-central1' if not specified otherwise
  const queue = getFunctions().taskQueue('processEmbedding');
  await queue.enqueue({ docPath, text });
}

function extractTextForEmbedding(data: any): string | null {
  if (!data) return null;

  // Compile a string of the most relevant text based on the document structure
  const parts = [];

  // Gmail
  if (data.subject) parts.push(`Subject: ${data.subject}`);
  if (data.from) parts.push(`From: ${data.from}`);
  if (data.snippet) parts.push(`Snippet: ${data.snippet}`);
  if (data.body) parts.push(`Body: ${data.body}`);

  // Docs
  if (data.title) parts.push(`Title: ${data.title}`);
  if (data.extractedText) parts.push(`Content: ${data.extractedText}`);

  // Keep / Chat / General
  if (data.textContent) parts.push(data.textContent);
  if (data.text) parts.push(data.text);
  if (data.notes) parts.push(data.notes);

  if (parts.length === 0) return null;

  const combined = parts.join('\n\n');

  // Chunking/capping to avoid massive payloads. text-embedding-004 supports 2048 tokens (~8k chars)
  // But let's pass a decent chunk. Genkit chunking can be added later if needed.
  return combined.length > 8000 ? combined.slice(0, 8000) : combined;
}

const handleDocumentWrite = async (event: any) => {
  const after = event.data?.after.data();
  const before = event.data?.before.data();

  if (!after) return; // Deleted

  // If the document already has an embedding and the text hasn't changed, skip.
  const textAfter = extractTextForEmbedding(after);
  const textBefore = extractTextForEmbedding(before);

  if (after.embedding && textAfter === textBefore) {
    return;
  }

  if (!textAfter) return;

  const docPath = event.data?.after?.ref.path || event.data?.before?.ref.path;
  if (!docPath) return;

  await enqueueEmbeddingTask(docPath, textAfter);
};

// 2. Triggers
export const onDocsWrittenEmbed = onDocumentWritten('users/{uid}/docs_content/{docId}', handleDocumentWrite);
export const onGmailWrittenEmbed = onDocumentWritten('users/{uid}/gmail_messages/{msgId}', handleDocumentWrite);
export const onKeepWrittenEmbed = onDocumentWritten('users/{uid}/keep_notes/{noteId}', handleDocumentWrite);
export const onChatWrittenEmbed = onDocumentWritten('users/{uid}/chat_messages/{msgId}', handleDocumentWrite);
