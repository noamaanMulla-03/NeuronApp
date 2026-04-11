import * as admin from 'firebase-admin';

/**
 * Persists multiple documents to a user-specific subcollection in Firestore.
 * Automatically chunks writes into batches of 500 to satisfy Firestore limits.
 */
export async function batchWriteUserDocs(
  uid: string,
  writes: { path: string[]; data: Record<string, any> }[]
): Promise<void> {
  const db = admin.firestore();
  const CHUNK_SIZE = 500;

  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const chunk = writes.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    for (const write of chunk) {
      // Reconstruct path: users/{uid}/{...segments}
      const fullPath = ['users', uid, ...write.path];
      const docRef = db.doc(fullPath.join('/'));
      batch.set(docRef, write.data, { merge: true });
    }

    await batch.commit();
  }
}

/**
 * Writes a single document to a user-specific path.
 */
export async function writeUserDoc(
  uid: string,
  path: string[],
  data: Record<string, any>
): Promise<void> {
  const db = admin.firestore();
  const fullPath = ['users', uid, ...path];
  const docRef = db.doc(fullPath.join('/'));
  await docRef.set(data, { merge: true });
}
