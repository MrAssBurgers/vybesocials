/**
 * Offline DM outbox.
 *
 * Queues outgoing direct messages in IndexedDB when the network is down (or a
 * send fails for a transient reason) and flushes them automatically as soon as
 * connectivity is restored. The UI shows the message immediately via the
 * existing optimistic-message system, so to the user the chat always feels
 * "sent" — it just delivers when the network is back.
 */
import { get, update } from 'idb-keyval';
import { onReconnect } from '@/lib/reconnectManager';
import { inferOtherParticipantId } from '@/lib/dmMembershipRepair';
import type { ViewMode } from '@/hooks/useMessages';
import { insertDmMessage } from '@/lib/dmSendCore';
import {
  classifyDmSendError,
  isPermanentDmSendFailure,
  isTransientDmSendFailure,
} from '@/lib/dmSendErrors';
import { reportAccountSnapshot, reportAccountSubscribe, isReportSessionError, type ReportAccountSession } from '@/lib/reportModerationService';
import { isOwnedDmActor } from '@/lib/dmAccountScope';

// v1 had no authenticated owner. Never read or migrate that shared queue.
const keyFor = (uid: string) => `vybe-dm-outbox-v2:${uid}`;

export interface OutboxItem {
  schemaVersion: 2;
  ownerUid: string;
  tempId: string;
  conversationId: string;
  senderId: string;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  viewMode: ViewMode;
  replyToId?: string;
  expiresAt: string | null;
  queuedAt: number;
  /** 'pending' retries automatically on reconnect; 'failed' needs an explicit retry/discard. */
  status?: 'pending' | 'failed';
  attempts?: number;
  lastError?: string;
  failedAt?: number;
}

const listeners = new Set<() => void>();
const flushing = new Set<string>();
let started = false;

function guardSession(session: ReportAccountSession) {
  const live = reportAccountSnapshot();
  if (!session.uid || session.uid !== live.uid || session.epoch !== live.epoch) throw Object.assign(new Error('Your account changed. Open this chat again.'), { code: 'account-changed' });
}
function validItems(value: unknown, uid: string): OutboxItem[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('The saved message queue could not be read.');
  return value.filter((row): row is OutboxItem => !!row && typeof row === 'object'
    && row.schemaVersion === 2 && row.ownerUid === uid
    && typeof row.tempId === 'string' && !!row.tempId && typeof row.conversationId === 'string' && !!row.conversationId
    && typeof row.senderId === 'string' && !!row.senderId && Number.isFinite(row.queuedAt)
    && (row.content === undefined || typeof row.content === 'string')
    && (row.mediaUrl === undefined || typeof row.mediaUrl === 'string')
    && (row.status === undefined || row.status === 'pending' || row.status === 'failed'));
}
async function readAll(session: ReportAccountSession): Promise<OutboxItem[]> {
  guardSession(session);
  const result = await get<unknown>(keyFor(session.uid!));
  guardSession(session);
  return validItems(result, session.uid!);
}
async function changeItems(session: ReportAccountSession, transform: (items: OutboxItem[]) => OutboxItem[]) {
  guardSession(session);
  // IndexedDB's read-modify-write transaction avoids lost concurrent enqueues.
  await update<OutboxItem[]>(keyFor(session.uid!), stored => {
    guardSession(session);
    return transform(validItems(stored, session.uid!));
  });
  guardSession(session);
  emit();
}

function emit() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function onOutboxChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function enqueue(item: Omit<OutboxItem, 'queuedAt' | 'ownerUid' | 'schemaVersion'>, session = reportAccountSnapshot()): Promise<void> {
  guardSession(session);
  if (!isOwnedDmActor(item.senderId, session.uid!)) throw new Error('Open your account before queuing this message.');
  const row: OutboxItem = { ...item, schemaVersion: 2, ownerUid: session.uid!, queuedAt: Date.now() };
  if (validItems([row], session.uid!).length !== 1) throw new Error('This message could not be queued.');
  await changeItems(session, items => {
    const previous = items.find(value => value.tempId === item.tempId);
    if (previous) {
      for (const field of ['conversationId', 'senderId', 'content', 'mediaUrl', 'mediaType', 'viewMode', 'replyToId', 'expiresAt'] as const) {
        if (previous[field] !== row[field]) throw new Error('This queued message changed. Send it again as a new message.');
      }
      return items;
    }
    return [...items, row];
  });
}

export async function removeItem(tempId: string, session = reportAccountSnapshot()): Promise<void> {
  await changeItems(session, items => items.filter(item => item.tempId !== tempId));
}

export async function getPending(session = reportAccountSnapshot()): Promise<OutboxItem[]> {
  return session.uid ? readAll(session) : [];
}

/** Items still auto-retrying (offline/transient) for a conversation, or all conversations. */
export async function getPendingCount(conversationId?: string, session = reportAccountSnapshot()): Promise<number> {
  const items = await getPending(session);
  return items.filter(
    (i) => i.status !== 'failed' && (!conversationId || i.conversationId === conversationId),
  ).length;
}

/** Items that exhausted auto-retry and need the user to retry/discard explicitly. */
export async function getFailedItems(conversationId?: string, session = reportAccountSnapshot()): Promise<OutboxItem[]> {
  const items = await getPending(session);
  return items.filter(
    (i) => i.status === 'failed' && (!conversationId || i.conversationId === conversationId),
  );
}

async function updateItem(tempId: string, patch: Partial<OutboxItem>, session: ReportAccountSession): Promise<void> {
  await changeItems(session, items => items.map(item => item.tempId === tempId ? { ...item, ...patch } : item));
}

/** Reset a failed item back to pending and immediately try again. Returns false if not found. */
export async function retryFailedItem(tempId: string, session = reportAccountSnapshot()): Promise<boolean> {
  const items = await readAll(session);
  const item = items.find((i) => i.tempId === tempId);
  if (!item) return false;
  await updateItem(tempId, { status: 'pending', lastError: undefined, failedAt: undefined }, session);
  void flush(session);
  return true;
}

/** Drop a queued/failed item without sending it (user dismissed it). */
export async function discardItem(tempId: string, session = reportAccountSnapshot()): Promise<void> {
  await removeItem(tempId, session);
}

async function sendOne(item: OutboxItem, session: ReportAccountSession): Promise<{ ok: boolean; transient: boolean; error?: string }> {
  try {
    guardSession(session);
    if (item.ownerUid !== session.uid || !isOwnedDmActor(item.senderId, session.uid!)) return { ok: false, transient: false, error: 'Open your account again before retrying this message.' };
    const otherProfileId =
      inferOtherParticipantId(item.conversationId, item.senderId) || null;
    // The canonical callable verifies membership. Reconnect must never repair
    // client identity using a possibly different account after an await.
    const { error } = await insertDmMessage(
      {
        conversation_id: item.conversationId,
        sender_id: item.senderId,
        content: item.content,
        media_url: item.mediaUrl,
        media_type: item.mediaType,
        view_mode: item.viewMode,
        expires_at: item.expiresAt,
        reply_to_id: item.replyToId,
        client_message_id: item.tempId,
      },
      { otherProfileId, accountGuard: () => guardSession(session) },
    );
    guardSession(session);
    if (error) {
      const message = error.message || 'Failed to send';
      const kind = classifyDmSendError(error);
      const transient =
        isTransientDmSendFailure(kind) && !isPermanentDmSendFailure(kind);
      return { ok: false, transient, error: message };
    }
    // sendDmMessage also records conversation activity on the server.
    return { ok: true, transient: false };
  } catch (err) {
    if (isReportSessionError(err)) throw err;
    const message = err instanceof Error ? err.message : 'Failed to send';
    const kind = classifyDmSendError(message);
    return {
      ok: false,
      transient: isTransientDmSendFailure(kind),
      error: message,
    };
  }
}

function dispatch(name: string, detail: Record<string, unknown>, session: ReportAccountSession) {
  guardSession(session);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail: { ...detail, ownerUid: session.uid, accountEpoch: session.epoch } }));
}

export async function flush(session = reportAccountSnapshot()): Promise<void> {
  if (!session.uid) return;
  const flight = `${session.uid}:${session.epoch}`;
  if (flushing.has(flight)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing.add(flight);
  try {
    const items = await readAll(session);
    if (!items.length) return;

    for (const item of items) {
      guardSession(session);
      if (item.status === 'failed') continue; // needs explicit retry
      // A user may discard a later item while an earlier send is in flight.
      if (!(await readAll(session)).some(current => current.tempId === item.tempId && current.status !== 'failed')) continue;

      const result = await sendOne(item, session);
      if (result.ok) {
        await removeItem(item.tempId, session);
        dispatch('vybe:dm-outbox-flush', { conversationId: item.conversationId, tempId: item.tempId }, session);
        continue;
      }

      if (result.transient) {
        // Stop on first transient failure; we'll retry on next reconnect.
        break;
      }

      // Permanent failure (validation, permission, etc.) — surface it instead
      // of silently dropping the message from the queue.
      await updateItem(item.tempId, {
        status: 'failed',
        lastError: result.error,
        failedAt: Date.now(),
        attempts: (item.attempts ?? 0) + 1,
      }, session);
      dispatch('vybe:dm-outbox-failed', {
        conversationId: item.conversationId,
        tempId: item.tempId,
        error: result.error,
      }, session);
    }
  } catch (error) {
    // Retain the initiating account's queue on auth/storage failure; a later
    // authorized reconnect retries its same idempotency key.
    if (!isReportSessionError(error)) console.warn('[Outbox] Saved queue is unavailable.');
  } finally {
    flushing.delete(flight);
  }
}

/** Wire up automatic flushing on reconnect + tab focus. Idempotent. */
export function startOutbox(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Try once on boot in case we were offline last session.
  void flush();
  reportAccountSubscribe(() => { emit(); void flush(); });

  onReconnect(() => {
    void flush();
  });

  window.addEventListener('online', () => {
    void flush();
  });
  window.addEventListener('vybe:online', () => {
    void flush();
  });
  window.addEventListener('focus', () => {
    void flush();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void flush();
    }
  });

  window.addEventListener('app-resumed', () => {
    void flush();
  });
}
