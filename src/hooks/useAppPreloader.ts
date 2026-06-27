import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isPersistRestored, markPersistRestored, onPersistRestored } from '@/lib/persistRestoreGate';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { isSetupRoutePath } from '@/lib/splashSession';
import { publishSplashProgress } from '@/lib/splashProgressBridge';
import {
  runSplashPreload,
  splashStepProgress,
  type SplashPreloadStepKey,
} from '@/lib/splashPreload';
import { preloadSecondaryRoutes } from '@/lib/routePreloader';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Waking up...',
    progress: 0,
    isComplete: false,
  });
  const hasStarted = useRef(false);
  const currentProgress = useRef(0);
  const animFrameRef = useRef<number>(0);
  const [restoreReady, setRestoreReady] = useState(isPersistRestored);

  useEffect(() => onPersistRestored(() => setRestoreReady(true)), []);

  // Never block cold start if IndexedDB restore is slow or unavailable (private mode).
  useEffect(() => {
    if (restoreReady) return;
    const t = setTimeout(() => {
      markPersistRestored();
      setRestoreReady(true);
    }, isNativePerfMode() ? 350 : 250);
    return () => clearTimeout(t);
  }, [restoreReady]);

  const animateTo = useCallback((target: number, label: string, done = false) => {
    const start = currentProgress.current;
    const delta = target - start;
    if (delta <= 0 && !done) {
      publishSplashProgress(target, label);
      setStatus({ step: label, progress: target, isComplete: done });
      return;
    }
    const duration = Math.max(120, Math.min(Math.abs(delta) * 10, 480));
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(start + delta * eased);
      currentProgress.current = value;
      publishSplashProgress(value, label);
      setStatus({ step: label, progress: value, isComplete: done && t >= 1 });
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        currentProgress.current = target;
        publishSplashProgress(target, label);
        setStatus({ step: label, progress: target, isComplete: done });
      }
    };
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const reportStep = useCallback(
    (stepKey: SplashPreloadStepKey, partial = 1) => {
      const { progress, label } = splashStepProgress(stepKey, partial);
      animateTo(progress, label, stepKey === 'ready' && partial >= 1);
    },
    [animateTo],
  );

  useEffect(() => {
    if (!restoreReady) return;
    if (hasStarted.current) return;
    hasStarted.current = true;

    publishSplashProgress(0, 'Waking up...');

    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (isSetupRoutePath(path)) {
      reportStep('ready', 1);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await runSplashPreload(queryClient, {
          onStep: (key, partial) => {
            if (!cancelled) reportStep(key, partial);
          },
          authTimeoutMs: isNativePerfMode() ? 4500 : 5000,
          stepTimeoutMs: isNativePerfMode() ? 7000 : 9000,
        });
      } catch (err) {
        console.warn('[Preloader] splash pipeline failed:', err);
        if (!cancelled) reportStep('ready', 1);
      } finally {
        if (!cancelled) {
          setTimeout(() => preloadSecondaryRoutes(), 800);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [restoreReady, queryClient, reportStep]);

  return status;
}
