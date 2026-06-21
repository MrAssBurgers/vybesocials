import { db } from '@/lib/firebase';
import { updateDocument } from '@/lib/firebase/firestoreDb';
import { firebaseAuth } from '@/lib/firebase/authService';

/** Pick the most recent last_read_at across duplicate membership rows. */
export function maxLastReadAt(
  rows: Array<{ last_read_at?: string | null }>,
): string | null {
  let best: string | null = null;
  for (const row of rows) {
    const ts = row.last_read_at;
    if (!ts) continue;
    if (!best || ts > best) best = ts;
  }
  return best;
}

/**
 * Persist read state for every membership doc the viewer may have
 * (profile id + Firebase auth uid + legacy query matches).
 */
export async function markConversationReadForViewer(
  conversationId: string,
  profileId: string,
  authUid?: string | null,
): Promise<void> {
  if (!conversationId || !profileId) return;

  const now = new Date().toISOString();
  const userIds = [...new Set([profileId, authUid].filter(Boolean))] as string[];

  await Promise.all(
    userIds.map(async (uid) => {
      try {
        await updateDocument('conversation_members', `${conversationId}_${uid}`, {
          last_read_at: now,
          updated_at: now,
        });
      } catch {
        /* composite doc may not exist yet */
      }
    }),
  );

  await Promise.all(
    userIds.map(async (uid) => {
      await db
        .from('conversation_members')
        .update({ last_read_at: now, updated_at: now })
        .eq('conversation_id', conversationId)
        .eq('user_id', uid);
    }),
  );
}

/** Resolve auth uid for the current session (best-effort). */
export async function getSessionAuthUid(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  return user?.id ?? null;
}
