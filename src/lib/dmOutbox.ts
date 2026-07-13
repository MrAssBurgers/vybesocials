/**
 * Offline DM outbox.
 *
 * Queues outgoing direct messages in IndexedDB when the network is down (or a
 * send fails for a transient reason) and flushes them automatically as soon as
 * connectivity is restored. The UI shows the message immediately via the
 * existing optimistic-message system, so to the user the chat always feels
 * "sent" — it just delivers when the network is back.
 */
import { get, set } from 'idb-keyval';
import { onReconnect } from '@/lib/reconnectManager';
import {
  inferOtherParticipantId,
  repairConversationForSend,
} from '@/lib/dmMembershipRepair';
import type { ViewMode } from '@/hooks/useMessages';
import { insertDmMessage, bumpConversationUpdatedAt } from '@/lib/dmSendCore';
import {
  classifyDmSendError,
  isPermanentDmSendFailure,
  isTransientDmSendFailure,
} from '@/lib/dmSendErrors';

const KEY = 'vybe-dm-outbox-v1';

export interface OutboxItem {
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
let flushing = false;
let started = false;

async function readAll(): Promise<OutboxItem[]> {
  try {
    return (await get<OutboxItem[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  try {
    await set(KEY, items);
  } catch {
    // Quota or private mode — silently skip; mutation still attempts in-memory.
  }
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

export async function enqueue(item: Omit<OutboxItem, 'queuedAt'>): Promise<void> {
  const items = await readAll();
  items.push({ ...item, queuedAt: Date.now() });
  await writeAll(items);
  emit();
}

export async function removeItem(tempId: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((i) => i.tempId !== tempId));
  emit();
}

export async function getPending(): Promise<OutboxItem[]> {
  return readAll();
}

/** Items still auto-retrying (offline/transient) for a conversation, or all conversations. */
export async function getPendingCount(conversationId?: string): Promise<number> {
  const items = await readAll();
  return items.filter(
    (i) => i.status !== 'failed' && (!conversationId || i.conversationId === conversationId),
  ).length;
}

/** Items that exhausted auto-retry and need the user to retry/discard explicitly. */
export async function getFailedItems(conversationId?: string): Promise<OutboxItem[]> {
  const items = await readAll();
  return items.filter(
    (i) => i.status === 'failed' && (!conversationId || i.conversationId === conversationId),
  );
}

async function updateItem(tempId: string, patch: Partial<OutboxItem>): Promise<void> {
  const items = await readAll();
  const next = items.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i));
  await writeAll(next);
  emit();
}

/** Reset a failed item back to pending and immediately try again. Returns false if not found. */
export async function retryFailedItem(tempId: string): Promise<boolean> {
  const items = await readAll();
  const item = items.find((i) => i.tempId === tempId);
  if (!item) return false;
  await updateItem(tempId, { status: 'pending', lastError: undefined, failedAt: undefined });
  void flush();
  return true;
}

/** Drop a queued/failed item without sending it (user dismissed it). */
export async function discardItem(tempId: string): Promise<void> {
  await removeItem(tempId);
}

async function sendOne(item: OutboxItem): Promise<{ ok: boolean; transient: boolean; error?: string }> {
  try {
    const otherProfileId =
      inferOtherParticipantId(item.conversationId, item.senderId) || null;
    await repairConversationForSend(
      item.conversationId,
      item.senderId,
      otherProfileId,
      { force: true },
    ).catch((err) => {
      console.warn('[Outbox] membership repair before send failed:', err);
    });

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
      { otherProfileId },
    );
    if (error) {
      const message = error.message || 'Failed to send';
      const kind = classifyDmSendError(error);
      const transient =
        isTransientDmSendFailure(kind) && !isPermanentDmSendFailure(kind);
      return { ok: false, transient, error: message };
    }
    void bumpConversationUpdatedAt(item.conversationId);
    return { ok: true, transient: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send';
    const kind = classifyDmSendError(message);
    return {
      ok: false,
      transient: isTransientDmSendFailure(kind),
      error: message,
    };
  }
}

function dispatch(name: string, detail: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    const items = await readAll();
    if (!items.length) return;

    for (const item of items) {
      if (item.status === 'failed') continue; // needs explicit retry

      const result = await sendOne(item);
      if (result.ok) {
        await removeItem(item.tempId);
        dispatch('vybe:dm-outbox-flush', { conversationId: item.conversationId, tempId: item.tempId });
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
      });
      dispatch('vybe:dm-outbox-failed', {
        conversationId: item.conversationId,
        tempId: item.tempId,
        error: result.error,
      });
    }
  } finally {
    flushing = false;
  }
}

/** Wire up automatic flushing on reconnect + tab focus. Idempotent. */
export function startOutbox(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Try once on boot in case we were offline last session.
  void flush();

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
