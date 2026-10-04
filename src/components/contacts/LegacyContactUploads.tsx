import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { db } from '@/lib/firebase';
import { captureContactActor } from '@/lib/contactDiscoveryService';
import { Button } from '@/components/ui/button';

/** Explicit cleanup of the old feature only; new matching never writes these records. */
export function LegacyContactUploads() {
  const { user, profile } = useAuth(), session = useReportAccountSession();
  const key = `${user?.id}:${profile?.id}:${profile?.user_id}:${session.epoch}`, live = useRef(key); live.current = key;
  const mounted = useRef(true);
  const revision = useRef(0);
  const [state, setState] = useState<{ key: string; count?: number; busy?: boolean; error?: string }>({ key });
  const ready = !!user?.id && profile?.user_id === user.id && session.uid === user.id;
  const current = ready && state.key === key ? state : { key };
  const actor = () => captureContactActor(user?.id || '', profile?.id || '', () => { if (!mounted.current || live.current !== key) throw new Error('Account changed'); });
  const load = async () => {
    if (!ready) return;
    let owner: ReturnType<typeof actor>; try { owner = actor(); } catch { return; }
    const operation = ++revision.current;
    try {
      const result = await db.from('contact_hashes').select('sha256', { count: 'exact', head: true }).eq('user_id', owner.uid); owner.guard();
      if (operation !== revision.current) return;
      if (result.error) throw result.error;
      setState({ key, count: result.count ?? 0 });
    } catch { try { owner.guard(); if (operation === revision.current) setState({ key, error: 'Previous uploaded contacts could not be checked.' }); } catch { /* Retired view. */ } }
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setState({ key }); void load(); }, [key, ready]);
  const clear = async () => {
    if (!ready || current.busy) return;
    let owner: ReturnType<typeof actor>; try { owner = actor(); } catch { return; }
    const operation = ++revision.current;
    setState({ ...current, key, busy: true, error: undefined });
    try {
      owner.guard(); const result = await db.from('contact_hashes').delete().eq('user_id', owner.uid); owner.guard();
      if (operation !== revision.current) return;
      if (result.error) throw result.error;
      setState({ key, count: 0 });
    } catch { try { owner.guard(); if (operation === revision.current) setState({ ...current, key, error: 'Previous contacts could not be cleared. Retry when you are connected.' }); } catch { /* Retired view. */ } }
  };
  return <div className="text-xs text-muted-foreground space-y-2"><p>Previous uploaded contact hashes are not used by this search. Existing uploads are retained until you clear them.</p>
    {current.error && <p role="alert">{current.error} <button type="button" className="underline" onClick={() => { void load(); }}>Retry check</button></p>}
    {!!current.count && <Button variant="outline" size="sm" disabled={current.busy} onClick={() => { void clear(); }}>{current.busy ? 'Clearing…' : `Clear previous uploaded contacts (${current.count})`}</Button>}
  </div>;
}
