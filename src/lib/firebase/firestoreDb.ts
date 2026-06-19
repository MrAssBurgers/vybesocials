import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  type QueryConstraint,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { sanitizeFirestoreData } from '@/lib/firestoreSanitize';
import { getFirebaseApp } from './app';
import { isFirebaseConfigured } from './config';

let db: ReturnType<typeof getFirestore> | null = null;

function getDb() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

/** Legacy Postgres table names → Firestore collection paths (1:1 with Lovable import). */
export const TABLE_TO_COLLECTION: Record<string, string> = {};

export function resolveCollection(table: string): string {
  return TABLE_TO_COLLECTION[table] ?? table;
}

export function getFirestoreDb() {
  return getDb();
}

export function collectionRef(table: string) {
  return collection(getDb(), resolveCollection(table));
}

export function documentRef(table: string, id: string) {
  return doc(getDb(), resolveCollection(table), id);
}

export async function getDocument<T extends DocumentData>(
  table: string,
  id: string,
): Promise<T | null> {
  const snap = await getDoc(documentRef(table, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as unknown as T;
}

export async function getDocuments<T extends DocumentData>(
  table: string,
  constraints: QueryConstraint[] = [],
): Promise<T[]> {
  const q = query(collectionRef(table), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T);
}

export async function setDocument(
  table: string,
  id: string,
  data: DocumentData,
  merge = true,
): Promise<void> {
  const payload = sanitizeFirestoreData({
    ...data,
    updated_at: new Date().toISOString(),
  });
  await setDoc(documentRef(table, id), payload, { merge });
}

export async function updateDocument(
  table: string,
  id: string,
  data: DocumentData,
): Promise<void> {
  const payload = sanitizeFirestoreData({
    ...data,
    updated_at: new Date().toISOString(),
  });
  await updateDoc(documentRef(table, id), payload);
}

export async function deleteDocument(table: string, id: string): Promise<void> {
  await deleteDoc(documentRef(table, id));
}

export async function batchSet(
  table: string,
  rows: Array<{ id?: string; data: DocumentData }>,
): Promise<void> {
  const batch = writeBatch(getDb());
  for (const row of rows) {
    const id = row.id || doc(collectionRef(table)).id;
    batch.set(documentRef(table, id), sanitizeFirestoreData({
      ...row.data,
      id,
      created_at: row.data.created_at || new Date().toISOString(),
    }), { merge: true });
  }
  await batch.commit();
}

export { query, where, orderBy, firestoreLimit, serverTimestamp, onSnapshot };
export type { QueryConstraint, Unsubscribe, DocumentData };
