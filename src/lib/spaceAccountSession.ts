import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';

export interface SpaceActor { uid: string; profileId: string; epoch: number }
export function spaceActorGuard(actor: SpaceActor, signal?: AbortSignal) {
  const account = reportAccountGuard(actor.uid);
  return () => {
    account();
    if (reportAccountSnapshot().epoch !== actor.epoch) throw Object.assign(new Error('Your account changed. Reopen this room.'), { code: 'account-changed' });
    if (signal?.aborted) throw new DOMException('Room request cancelled', 'AbortError');
  };
}
