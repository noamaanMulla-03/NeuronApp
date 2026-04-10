import { getApps } from 'firebase/app';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    writeBatch,
    Firestore,
    DocumentData,
} from 'firebase/firestore';

const app = getApps()[0];
export const db: Firestore = getFirestore(app);

/** Returns a document reference at users/{uid}/{...path} */
export function userDoc(uid: string, ...pathSegments: string[]) {
    return doc(db, 'users', uid, ...pathSegments);
}

/** Returns a collection reference at users/{uid}/{...path} */
export function userCollection(uid: string, ...pathSegments: string[]) {
    return collection(db, 'users', uid, ...pathSegments);
}

/** Write a single document under a user's namespace */
export async function writeUserDoc(
    uid: string,
    path: string[],
    data: DocumentData,
): Promise<void> {
    const ref = doc(db, 'users', uid, ...path);
    await setDoc(ref, data, { merge: true });
}

/** Read a single document under a user's namespace */
export async function readUserDoc(
    uid: string,
    path: string[],
): Promise<DocumentData | null> {
    const ref = doc(db, 'users', uid, ...path);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
}

/**
 * Batch write multiple documents. Firestore limits batches to 500 writes,
 * so this splits into chunks automatically.
 */
export async function batchWriteUserDocs(
    uid: string,
    writes: { path: string[]; data: DocumentData }[],
): Promise<void> {
    const BATCH_LIMIT = 500;

    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
        const chunk = writes.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);

        for (const { path, data } of chunk) {
            const ref = doc(db, 'users', uid, ...path);
            batch.set(ref, data, { merge: true });
        }

        await batch.commit();
    }
}
