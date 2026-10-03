import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firestoreDb';

type PostData = Record<string, unknown> & { id: string; author_id: string; game_capture_id: string };

function postReference(captureId: string) {
  if (!/^[a-f0-9]{48}$/.test(captureId)) throw new Error('Invalid game capture.');
  return doc(getFirestoreDb(), 'posts', `game_${captureId}`);
}

function verifyExisting(data: Record<string, unknown>, captureId: string, authorId: string): PostData {
  if (data.author_id !== authorId || data.game_capture_id !== captureId) throw new Error('This capture post belongs to another author.');
  return data as PostData;
}

export async function findGameCapturePost(captureId: string, authorId: string): Promise<PostData | null> {
  const snapshot = await getDocFromServer(postReference(captureId));
  return snapshot.exists() ? verifyExisting(snapshot.data(), captureId, authorId) : null;
}

/** First confirmed write wins across tabs and retries; no existing post is overwritten. */
export async function saveGameCapturePost(captureId: string, authorId: string, payload: Record<string, unknown>) {
  const reference = postReference(captureId);
  return runTransaction(getFirestoreDb(), async transaction => {
    const existing = await transaction.get(reference);
    if (existing.exists()) return { post: verifyExisting(existing.data(), captureId, authorId), created: false };
    const post: PostData = {
      ...payload, id: reference.id, author_id: authorId, game_capture_id: captureId,
      created_at: new Date().toISOString(), view_count: 0, is_pinned: false,
    };
    transaction.set(reference, post);
    return { post, created: true };
  });
}
