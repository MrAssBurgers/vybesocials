import type { Message } from '@/hooks/useMessages';
import { safeMessageViews } from '@/lib/messagesQueryKey';

export type VybeRecipientState = 'unopened' | 'replay_available' | 'exhausted';

/** Recipient: unopened → one view → one hold-replay → exhausted (persists on refresh). */
export function getVybeRecipientState(
  message: Message,
  profileId?: string | null,
): VybeRecipientState {
  if (!profileId || message.media_type !== 'vybe') return 'unopened';
  if (
    (message as { vybe_replay_exhausted?: boolean }).vybe_replay_exhausted ||
    (message.view_mode as string) === 'vybe_locked'
  ) {
    return 'exhausted';
  }
  const viewed = safeMessageViews(message).some((v) => v.user_id === profileId);
  if (!viewed) return 'unopened';
  return 'replay_available';
}

export function isVybeReplayExhausted(message: Message): boolean {
  return (
    (message as { vybe_replay_exhausted?: boolean }).vybe_replay_exhausted === true ||
    (message.view_mode as string) === 'vybe_locked'
  );
}
