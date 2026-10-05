import { useMemo, useRef, useState } from 'react';
import { useMapViewGuard } from './useMapSocial';
import type { LiveFriend } from '@/lib/vybemap/types';

/** Open the selected friend's chat without retaining a departed account or map view. */
export function useMapFriendChat(friend: LiveFriend | null, onOpen: (id: string) => void) {
  const view = useMapViewGuard(`friend-chat:${friend?.user_id || ''}`);
  const viewId = useMemo(() => Symbol(), [view.scope]);
  const latest = useRef(friend); latest.current = friend;
  const pending = useRef<{ viewId: symbol; token: symbol } | null>(null);
  const [state, setState] = useState({ viewId, loading: false, error: '' });
  const open = async () => {
    if (!friend || pending.current?.viewId === viewId) return;
    const token = Symbol(), revision = friend.accessRevision, friendId = friend.user_id;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const guard = () => {
      view.guard();
      const current = latest.current;
      if (!active || !revision || current?.user_id !== friendId || current.accessRevision !== revision || (current.accessUntil || 0) <= Date.now()) throw new Error('Refresh this friend before opening the chat.');
    };
    try {
      guard(); pending.current = { viewId, token }; setState({ viewId, loading: true, error: '' });
      const id = await Promise.race([
        (async () => { const { createDmChat } = await import('@/lib/firebase/chats'); guard(); const id = await createDmChat(friendId, guard); guard(); return id; })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new Error('Opening the chat took too long. Please retry.')); }, 15000); }),
      ]);
      guard();
      if (typeof id !== 'string' || !id || id.includes('/')) throw new Error('The conversation could not be confirmed. Please retry.');
      onOpen(id);
    } catch (error) {
      try { view.guard(); if (latest.current?.user_id === friendId) setState({ viewId, loading: false, error: error instanceof Error ? error.message : 'The chat could not be opened. Please retry.' }); } catch { /* Retired view. */ }
    } finally {
      active = false; if (timer) clearTimeout(timer);
      if (pending.current?.token === token) { pending.current = null; try { view.guard(); setState(previous => previous.viewId === viewId ? { ...previous, loading: false } : previous); } catch { /* Retired view. */ } }
    }
  };
  return { open, isPending: state.viewId === viewId && state.loading, error: state.viewId === viewId ? state.error : '' };
}
