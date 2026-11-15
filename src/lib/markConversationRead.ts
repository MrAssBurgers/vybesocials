import { db } from '@/lib/firebase';
import { getDocumentFromServer, updateDocument } from '@/lib/firebase/firestoreDb';
import { firebaseAuth } from '@/lib/firebase/authService';
import { isOwnedDmActor } from '@/lib/dmAccountScope';
import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';

export function maxLastReadAt(rows: Array<{ last_read_at?: string | null }>): string | null {
  let best: string | null = null;
  for (const row of rows) if (row.last_read_at && (!best || row.last_read_at > best)) best = row.last_read_at;
  return best;
}

/** Update confirmed owned memberships only. A failed write is not a read receipt. */
export async function markConversationReadForViewer(conversationId: string, profileId: string, authUid?: string | null, extraGuard?: () => void): Promise<void> {
  const session = reportAccountSnapshot(), uid = authUid || session.uid;
  const accountGuard = reportAccountGuard(uid);
  const guard = () => {
    extraGuard?.(); accountGuard();
    if (reportAccountSnapshot().epoch !== session.epoch || uid !== session.uid || !isOwnedDmActor(profileId, uid)) throw new Error('Your account session changed.');
  };
  guard();
  if (!conversationId || conversationId.includes('/')) throw new Error('Refresh Messages before marking read.');
  const now = new Date().toISOString(), acknowledged = new Set<string>(), failures: unknown[] = [];
  const save = async (row: Record<string, unknown> | null, id: string, actor: string) => {
    guard();
    if (!row || row.conversation_id !== conversationId || row.user_id !== actor || !id || id.includes('/') || acknowledged.has(id)) return;
    await updateDocument('conversation_members', id, { last_read_at: now, updated_at: now }); guard(); acknowledged.add(id);
  };
  for (const actor of new Set([profileId, uid])) {
    guard();
    const id = `${conversationId}_${actor}`;
    try { const row = await getDocumentFromServer('conversation_members', id); guard(); await save(row, id, actor); if (acknowledged.size) return; }
    catch (error) { guard(); failures.push(error); }
    guard();
    try {
      const result = await db.from('conversation_members').select('id,conversation_id,user_id').eq('conversation_id', conversationId).eq('user_id', actor);
      guard(); if (result.error) throw result.error;
      for (const row of result.data || []) {
        guard();
        if (typeof row.id !== 'string' || !row.id || row.id.includes('/') || row.conversation_id !== conversationId || row.user_id !== actor) continue;
        // Legacy data may contain its own id field. Confirm the physical
        // document's tuple before using that hint as an update target.
        const stored = await getDocumentFromServer('conversation_members', row.id); guard();
        await save(stored, row.id, actor); if (acknowledged.size) return;
      }
    } catch (error) { guard(); failures.push(error); }
  }
  guard();
  if (!acknowledged.size) throw failures[0] || new Error('Your chat membership could not be confirmed. Refresh Messages and try again.');
}

export async function getSessionAuthUid(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser(); return user?.id ?? null;
}
