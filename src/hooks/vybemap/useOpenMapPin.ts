import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useMapViewGuard } from './useMapSocial';
import type { MapContentPin, MapPinPage, MapPinState } from '@/lib/vybemap/mapPinService';

/** Re-admit the selected source before navigating to its independently checked reader. */
export function useOpenMapPin(pins: MapContentPin[], renderer: string, navigate: (path: string) => void) {
  const view = useMapViewGuard(`open-content:${renderer}`);
  const client = useQueryClient();
  const current = useRef({ pins, view, navigate }); current.current = { pins, view, navigate };
  const work = useRef(0);
  const [state, setState] = useState<{ scope: string; pinId: string; pending: boolean; error: string } | null>(null);
  const pending = useRef<{ id: string; scope: string; token: number } | null>(null);
  const dismiss = useCallback(() => { work.current++; pending.current = null; setState(null); }, []);
  useEffect(() => {
    const retire = () => dismiss();
    document.addEventListener('visibilitychange', retire);
    window.addEventListener('pagehide', retire);
    return () => { work.current++; pending.current = null; document.removeEventListener('visibilitychange', retire); window.removeEventListener('pagehide', retire); };
  }, [dismiss, view.scope]);

  const open = useCallback(async (pin: MapContentPin) => {
    const { view: initial } = current.current;
    if (pending.current?.id === pin.id && pending.current.scope === initial.scope) return;
    const token = ++work.current;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const guard = () => {
      initial.guard();
      const latest = current.current.pins.find(row => row.id === pin.id);
      if (!active || work.current !== token || current.current.view.scope !== initial.scope || document.visibilityState === 'hidden' || !latest || latest.revision !== pin.revision || latest.sourceId !== pin.sourceId || latest.sourceType !== pin.sourceType) throw new Error('This map content changed. Please select it again.');
    };
    try {
      guard(); pending.current = { id: pin.id, scope: initial.scope, token };
      setState({ scope: initial.scope, pinId: pin.id, pending: true, error: '' });
      const result = await Promise.race([
        (async () => {
          const { readMapPin } = await import('@/lib/vybemap/mapPinService'); guard();
          return readMapPin({ uid: initial.account.user!.id, profileId: initial.account.profile!.id }, pin.id, guard);
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new Error('Opening this content took too long. Please retry.')); }, 15000); }),
      ]);
      guard();
      const source = result.pin;
      if (result.validUntil <= Date.now()) throw new Error('This map content changed. Please select it again.');
      if (!source || source.id !== pin.id || source.revision !== pin.revision || source.sourceId !== pin.sourceId || source.sourceType !== pin.sourceType) {
        // A newer checked denial/replacement wins over every older cached page.
        // Cancel older reads first so their late responses cannot restore the pin.
        const prefix = ['map-pins', initial.account.user!.id, initial.account.profile!.id, initial.account.session.epoch];
        await client.cancelQueries({ queryKey: prefix }); initial.guard();
        if (work.current !== token || current.current.view.scope !== initial.scope || document.visibilityState === 'hidden') return;
        client.setQueriesData<InfiniteData<MapPinPage>>({ queryKey: [...prefix, 'list'] }, data => data ? { ...data, pages: data.pages.map(page => ({ ...page, items: page.items.filter(row => row.id !== pin.id) })) } : data);
        client.setQueriesData<MapPinState>({ queryKey: [...prefix, 'state'] }, data => data?.pin?.id === pin.id ? { ...data, validUntil: 0 } : data);
        throw new Error(source ? 'This map content changed. Refresh shared content to see its current area.' : 'This content is no longer shared with you on the map.');
      }
      const base = source.sourceType === 'short' ? '/clips/' : source.sourceType === 'video' ? '/watch/' : '/p/';
      current.current.navigate(base + encodeURIComponent(source.sourceId));
      setState(null);
    } catch (error) {
      try {
        initial.guard();
        if (work.current === token && current.current.view.scope === initial.scope && document.visibilityState !== 'hidden') {
          setState({ scope: initial.scope, pinId: pin.id, pending: false, error: error instanceof Error ? error.message : 'This content could not open. Please retry.' });
        }
      } catch { /* Retired account or map. */ }
    } finally {
      active = false; if (timer) clearTimeout(timer);
      if (pending.current?.token === token) pending.current = null;
    }
  }, [client]);
  const visibleState = state?.scope === view.scope ? state : null;
  const retryPin = pins.find(pin => pin.id === visibleState?.pinId);
  return { open, dismiss, isPending: !!visibleState?.pending, error: visibleState?.error || '', canRetry: !!retryPin, retry: () => retryPin && open(retryPin) };
}
