import { useLayoutEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import { Play, RotateCcw, Square, Smartphone, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';
import { buildMiniAppDocument, MINI_APP_PERMISSIONS, MINI_APP_SANDBOX } from './sandbox';
import type { MiniAppSource } from './model';

export function MiniAppRunner({ source }: { source: MiniAppSource }) {
  const [activeSource, setActiveSource] = useState<MiniAppSource | null>(null);
  const [revision, setRevision] = useState(0);
  const [phoneWidth, setPhoneWidth] = useState(false);
  const [stopReason, setStopReason] = useState<'background' | 'motion' | null>(null);
  const [runtimeReducedMotion, setRuntimeReducedMotion] = useState(false);
  const systemReducedMotion = useReducedMotion();
  const { reducedMotion: appReducedMotion } = useTheme();
  const reducedMotion = Boolean(systemReducedMotion || appReducedMotion);
  // Freeze runtime preferences with the source snapshot. A preference change
  // stops this instance below instead of silently reloading its srcdoc.
  const sourceDocument = useMemo(() => activeSource ? buildMiniAppDocument(activeSource, runtimeReducedMotion) : '', [activeSource, runtimeReducedMotion]);
  const running = Boolean(activeSource);
  const newerSource = activeSource && JSON.stringify(activeSource) !== JSON.stringify(source);

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
    setRuntimeReducedMotion(reducedMotion);
    setActiveSource({ ...source });
    setRevision(value => value + 1);
  };
  return (
    <section aria-label="Mini app preview" className="overflow-hidden rounded-2xl border border-border bg-background/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <span className="text-sm font-medium">App preview</span>
        <div className="flex gap-2">
          {running && <Button size="sm" variant="ghost" onClick={() => setActiveSource(null)}><Square />Stop</Button>}
          <Button size="sm" variant="outline" onClick={run}>
            {running ? <RotateCcw /> : <Play />}{newerSource ? 'Run latest' : running ? 'Restart' : stopReason ? 'Run again' : 'Run app'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"><span className="text-xs text-muted-foreground">{newerSource ? 'New code is ready. The running app has not changed.' : phoneWidth ? 'Phone preview · 320px wide' : 'Preview fits the available space'}</span><div className="flex gap-1" aria-label="Preview width"><Button size="sm" variant="ghost" aria-pressed={phoneWidth} onClick={() => setPhoneWidth(true)}><Smartphone />Phone</Button><Button size="sm" variant="ghost" aria-pressed={!phoneWidth} onClick={() => setPhoneWidth(false)}><Maximize2 />Fit</Button></div></div>
      {running ? (
        <div className="mx-auto max-w-full motion-safe:transition-[width] motion-safe:duration-200" style={{ width: phoneWidth ? 320 : '100%', transition: reducedMotion ? 'none' : undefined }}><iframe key={revision} title={`${activeSource?.title} mini app`} srcDoc={sourceDocument} sandbox={MINI_APP_SANDBOX}
          allow={MINI_APP_PERMISSIONS} referrerPolicy="no-referrer" className="block h-[min(65vh,520px)] min-h-[360px] w-full border-0 bg-[#11111b]" /></div>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
          <Play aria-hidden className="h-10 w-10 text-primary" />
          <p role="status" className="font-medium">{stopReason === 'background' ? 'App stopped in the background' : stopReason === 'motion' ? 'App stopped after motion settings changed' : 'Your app is ready to run'}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{stopReason === 'background' ? 'The preview closed when VYBE went into the background. Run again to start fresh. Your code is unchanged.' : stopReason === 'motion' ? 'Run again to use your updated motion preference. Your code is unchanged; the preview starts fresh.' : 'Run code only from creators you trust. An app may contact outside services. Use Stop to close the preview.'}</p>
        </div>
      )}
      <p className="border-t border-border p-3 text-xs text-muted-foreground">Your VYBE account stays separate. Camera and microphone are disabled. Leaving this tab or app stops the preview; running again starts fresh.</p>
    </section>
  );
}
