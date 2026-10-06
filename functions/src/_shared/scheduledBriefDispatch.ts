import { createHash, randomUUID } from 'node:crypto';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function version(row: Record<string, unknown> | undefined, slot: string): string | null {
  if (!row || row.slot !== slot || typeof row.user_id !== 'string' || !row.user_id
    || typeof row.generated_at !== 'string' || typeof row.content !== 'string') return null;
  const generated = Date.parse(row.generated_at);
  if (!Number.isFinite(generated) || generated > Date.now() + 30_000 || generated < Date.now() - 24 * 3600_000) return null;
  return hash([row.user_id, row.slot, row.generated_at, row.content]);
}

/** Both scheduled aliases share a durable per-generation provider attempt.
 * A lost provider acknowledgement remains uncertain, never automatic resend. */
export async function dispatchScheduledBrief(
  db: Firestore, brief: DocumentReference, slot: string, expected: Record<string, unknown>,
  send: () => Promise<number>,
) {
  const generation = version(expected, slot);
  if (!generation) return { skipped: 'invalid-generation' as const };
  const attempt = randomUUID();
  const receipt = db.doc(`_brief_push_attempts/${hash([brief.path, generation])}`);
  const claimed = await db.runTransaction(async tx => {
    const [current, prior] = await Promise.all([tx.get(brief), tx.get(receipt)]);
    if (!current.exists || current.data()?.pinged === true || version(current.data(), slot) !== generation) return false;
    if (prior.exists && prior.data()?.phase !== 'failed') return false;
    tx.set(receipt, { version: 1, brief_path: brief.path, generation, attempt,
      phase: 'sending', started_at: new Date().toISOString() });
    return true;
  });
  if (!claimed) return { skipped: 'already-claimed' as const };
  // Persist sending before external work. Exception/crash/lost acknowledgement
  // cannot establish that no device received the notification.
  const sent = await send();
  if (!Number.isSafeInteger(sent) || sent < 0) throw new Error('Brief delivery result is uncertain.');
  await db.runTransaction(async tx => {
    const [current, prior] = await Promise.all([tx.get(brief), tx.get(receipt)]);
    if (prior.data()?.attempt !== attempt || prior.data()?.phase !== 'sending') throw new Error('Brief delivery acknowledgement changed.');
    tx.update(receipt, { phase: sent > 0 ? 'sent' : 'failed', sent, completed_at: new Date().toISOString() });
    // Do not mark a replacement brief as sent after an old provider result.
    if (sent > 0 && current.exists && version(current.data(), slot) === generation) tx.update(brief, { pinged: true });
  });
  return { sent };
}
