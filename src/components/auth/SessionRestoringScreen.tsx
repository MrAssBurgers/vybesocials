import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { abandonAuthRestore, getAuthRestoreState, retryAuthRestore, subscribeAuthRestoreState } from '@/lib/firebase/authService';

/** A disk hint never grants access, and a restore timeout is not a logout. */
export function SessionRestoringScreen() {
  const [delayed, setDelayed] = useState(false), [retrying, setRetrying] = useState(false);
  const state = useSyncExternalStore(subscribeAuthRestoreState, getAuthRestoreState, getAuthRestoreState);
  const mounted = useRef(true), pending = useRef(false);
  useEffect(() => { mounted.current = true; const timer = setTimeout(() => setDelayed(true), 8_000); return () => { mounted.current = false; clearTimeout(timer); }; }, []);
  const run = async (operation: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setRetrying(true);
    try { await operation(); } catch { /* Keep the saved account and offer another deliberate retry. */ }
    finally { pending.current = false; if (mounted.current) setRetrying(false); }
  };
  return <div role="status" aria-label="Restoring your account" className="min-h-[100dvh] bg-background flex flex-col gap-4 items-center justify-center px-6 text-center"
    style={{ backgroundImage: 'radial-gradient(ellipse at 18% 24%, hsl(var(--primary) / 0.25), transparent 65%), radial-gradient(ellipse at 82% 76%, hsl(var(--accent) / 0.2), transparent 65%)' }}>
    <div className="h-8 w-8 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin motion-reduce:animate-none" aria-hidden="true" />
    <p className="font-medium">Restoring your account…</p>
    {(delayed || state === 'error') && <>
      <p className="max-w-sm text-sm text-muted-foreground">Your saved sign-in has not finished loading. Check your connection and try again.</p>
      <button className="rounded-full bg-primary px-5 py-2 font-medium disabled:opacity-50" disabled={retrying} onClick={() => void run(retryAuthRestore)}>{retrying ? 'Trying again…' : 'Try again'}</button>
      {state === 'error' && <>
        <p className="max-w-sm text-sm text-muted-foreground">Or discard this unfinished restoration and sign in again on this device.</p>
        <button className="text-sm underline disabled:opacity-50" disabled={retrying} onClick={() => void run(abandonAuthRestore)}>Sign in again</button>
      </>}
    </>}
  </div>;
}
