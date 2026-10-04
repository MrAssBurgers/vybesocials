import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import { Play, RotateCcw, Square, Smartphone, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';
import { buildMiniAppDocument, MINI_APP_PERMISSIONS, MINI_APP_SANDBOX } from './sandbox';
import type { MiniAppSource } from './model';
import { MINI_APP_MAX_ERRORS, MINI_APP_START_TIMEOUT_MS, readMiniAppRuntimeMessage } from './runtimeMessages';

export function MiniAppRunner({ source }: { source: MiniAppSource }) {
  const [activeSource, setActiveSource] = useState<MiniAppSource | null>(null);
  const [revision, setRevision] = useState(0);
  const [phoneWidth, setPhoneWidth] = useState(false);
  const [stopReason, setStopReason] = useState<'background' | 'motion' | 'startup' | 'manual' | null>(null);
  const [starting, setStarting] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [runtimeReducedMotion, setRuntimeReducedMotion] = useState(false);
  const systemReducedMotion = useReducedMotion();
  const { reducedMotion: appReducedMotion } = useTheme();
  const reducedMotion = Boolean(systemReducedMotion || appReducedMotion);
  // Freeze runtime preferences with the source snapshot. A preference change
  // stops this instance below instead of silently reloading its srcdoc.
  const sourceDocument = useMemo(() => activeSource ? buildMiniAppDocument(activeSource, runtimeReducedMotion, String(revision)) : '', [activeSource, runtimeReducedMotion, revision]);
  const running = Boolean(activeSource);
  const newerSource = activeSource && JSON.stringify(activeSource) !== JSON.stringify(source);

  useLayoutEffect(() => {
    if (!running) return;
    const frameWindow = frameRef.current?.contentWindow;
    let active = true;
    let ready = false;
    let errors = 0;
    const timeout = window.setTimeout(() => {
      if (!active || ready) return;
      setActiveSource(null);
      setStopReason('startup');
    }, MINI_APP_START_TIMEOUT_MS);
    const receive = (event: MessageEvent) => {
      if (!active || !frameWindow || event.source !== frameWindow) return;
      const data = readMiniAppRuntimeMessage(event.data, String(revision));
      if (!data) return;
      if (data.kind === 'ready' && !ready) {
        ready = true;
        window.clearTimeout(timeout);
        setStarting(false);
      } else if (data.kind === 'error' && errors < MINI_APP_MAX_ERRORS) {
        errors++;
        setRuntimeErrors(previous => [...previous, data.message]);
      }
      // Untrusted diagnostics get a fixed budget per run, not a host API.
      if (ready && errors >= MINI_APP_MAX_ERRORS) window.removeEventListener('message', receive);
    };
    window.addEventListener('message', receive);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
    };
  }, [running, revision]);

  useLayoutEffect(() => {
    if (!running) return;
    if (runtimeReducedMotion !== reducedMotion) {
      setActiveSource(null);
      setStopReason('motion');
      return;
    }
    const stopInBackground = () => {
      // Destroy the browsing context before pagehide can put this page in the
      // back/forward cache. A CSS-hidden frame or a deferred state update would
      // leave the authored runtime alive. This is not a CPU isolation boundary.
      flushSync(() => { setActiveSource(null); setStopReason('background'); });
    };
    const visibilityChanged = () => { if (document.visibilityState === 'hidden') stopInBackground(); };
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', stopInBackground);
    // A visibility transition between the Run click and this commit must not
    // leave a frame mounted. Layout effects already flush this update.
    if (document.visibilityState === 'hidden') {
      setActiveSource(null);
      setStopReason('background');
    }
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', stopInBackground);
    };
  }, [running, reducedMotion, runtimeReducedMotion]);

  const run = () => {
    if (document.visibilityState === 'hidden') {
      setActiveSource(null);
      setStopReason('background');
      return;
    }
    setStopReason(null);
    setStarting(true);
    setRuntimeErrors([]);
    setRuntimeReducedMotion(reducedMotion);
    setActiveSource({ ...source });
    setRevision(value => value + 1);
  };
  return (
    <section aria-label="Mini app preview" className="overflow-hidden rounded-2xl border border-border bg-background/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <span className="text-sm font-medium">App preview</span>
        <div className="flex gap-2">
          {running && <Button size="sm" variant="ghost" onClick={() => { setActiveSource(null); setStopReason('manual'); }}><Square />Stop</Button>}
          <Button size="sm" variant="outline" onClick={run}>
            {running ? <RotateCcw /> : <Play />}{newerSource ? 'Run latest' : running ? 'Restart' : stopReason ? 'Run again' : 'Run app'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"><span className="text-xs text-muted-foreground">{newerSource ? 'New code is ready. The running app has not changed.' : phoneWidth ? 'Phone preview · 320px wide' : 'Preview fits the available space'}</span><div className="flex gap-1" aria-label="Preview width"><Button size="sm" variant="ghost" aria-pressed={phoneWidth} onClick={() => setPhoneWidth(true)}><Smartphone />Phone</Button><Button size="sm" variant="ghost" aria-pressed={!phoneWidth} onClick={() => setPhoneWidth(false)}><Maximize2 />Fit</Button></div></div>
      {running && <p role="status" className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{starting ? 'Starting preview…' : 'Preview started'}</p>}
      {runtimeErrors.length > 0 && <div role="alert" className="border-b border-destructive/30 bg-destructive/5 p-3 text-sm"><p className="font-medium">The app reported a problem</p><ul className="mt-2 max-h-36 space-y-1 overflow-auto font-mono text-xs">{runtimeErrors.map((message, index) => <li key={index} className="whitespace-pre-wrap break-words">{message}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">App-provided diagnostics only; no account action was taken.{runtimeErrors.length >= MINI_APP_MAX_ERRORS ? ' Further errors are hidden for this run.' : ''}</p></div>}
      {running ? (
        <div className="mx-auto max-w-full motion-safe:transition-[width] motion-safe:duration-200" style={{ width: phoneWidth ? 320 : '100%', transition: reducedMotion ? 'none' : undefined }}><iframe ref={frameRef} key={revision} title={`${activeSource?.title} mini app`} srcDoc={sourceDocument} sandbox={MINI_APP_SANDBOX}
          allow={MINI_APP_PERMISSIONS} referrerPolicy="no-referrer" className="block h-[min(65vh,520px)] min-h-[360px] w-full border-0 bg-[#11111b]" /></div>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
          <Play aria-hidden className="h-10 w-10 text-primary" />
          <p role="status" className="font-medium">{stopReason === 'background' ? 'App stopped in the background' : stopReason === 'motion' ? 'App stopped after motion settings changed' : stopReason === 'startup' ? 'App did not finish starting' : stopReason === 'manual' ? 'App stopped' : 'Your app is ready to run'}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{stopReason === 'background' ? 'The preview closed when VYBE went into the background. Run again to start fresh. Your code is unchanged.' : stopReason === 'motion' ? 'Run again to use your updated motion preference. Your code is unchanged; the preview starts fresh.' : stopReason === 'startup' ? 'The preview did not confirm startup, so it was closed. Run again to try a fresh instance. Your code is unchanged.' : stopReason === 'manual' ? 'Run again to start fresh. Your code is unchanged.' : 'Run code only from creators you trust. An app may contact outside services. Use Stop to close the preview.'}</p>
        </div>
      )}
      <p className="border-t border-border p-3 text-xs text-muted-foreground">Your VYBE account stays separate. Camera and microphone are disabled. Leaving this tab or app stops the preview; running again starts fresh. Code that locks up the browser may also prevent Stop from responding; close the tab if needed.</p>
    </section>
  );
}
