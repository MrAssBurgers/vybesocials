import { useEffect, useMemo, useRef, useState } from 'react';
import { useMapViewGuard } from './useMapSocial';
import { resolveTeleportQuery, type TeleportResult } from '@/lib/vybemap/mapbox/geocode';

/** A camera jump belongs only to the current visible view and latest submitted query. */
export function useMapSearch(onFound: (result: TeleportResult) => void, renderer: string) {
  const view = useMapViewGuard(`search:${renderer}`);
  const viewId = useMemo(() => Symbol(), [view.scope]);
  const pending = useRef<AbortController | null>(null);
  const callback = useRef(onFound); callback.current = onFound;
  const [state, setState] = useState({ viewId, loading: false, error: '' });
  const cancel = () => {
    pending.current?.abort(); pending.current = null;
    setState({ viewId, loading: false, error: '' });
  };
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') cancel(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', cancel);
    return () => { pending.current?.abort(); pending.current = null; document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', cancel); };
  }, [viewId]);
  const search = async (query: string): Promise<boolean> => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = () => { view.guard(); if (controller.signal.aborted || pending.current !== controller || document.visibilityState === 'hidden') throw new Error('Map search changed.'); };
    try {
      guard();
      if (!query.trim()) { setState({ viewId, loading: false, error: '' }); return false; }
      setState({ viewId, loading: true, error: '' });
      const result = await Promise.race([
        resolveTeleportQuery(query, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Place search took too long. Please retry.')), 15_000); }),
      ]);
      guard();
      if (performance.now() - started >= 15_000) throw new Error('Place search took too long. Please retry.');
      if (!result) { setState({ viewId, loading: false, error: 'No matching place. Try a city or a more specific address.' }); return false; }
      callback.current(result);
      setState({ viewId, loading: false, error: '' }); return true;
    } catch (error) {
      try { guard(); setState({ viewId, loading: false, error: error instanceof Error ? error.message : 'Place search could not finish. Please retry.' }); } catch { /* Retired work cannot move the camera or restore an old error. */ }
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      if (pending.current === controller) pending.current = null;
    }
  };
  return { search, cancel, isPending: state.viewId === viewId && state.loading, error: state.viewId === viewId ? state.error : '' };
}
