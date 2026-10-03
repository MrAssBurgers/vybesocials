/** Imperative splash progress — avoids re-rendering the full splash tree every frame. */

type SplashProgressListener = (progress: number, status: string) => void;

const listeners = new Set<SplashProgressListener>();

let lastProgress = 0;
let lastStatus = 'Waking up...';

declare global {
  interface Window {
    __vybeSplashProgress?: number;
    __vybeSplashStatus?: string;
    __vybePublishSplashProgress?: (progress: number, status: string) => void;
    __vybeStopFakeSplash?: () => void;
    __VYBE_MAIN_EVAL__?: boolean;
    __VYBE_APP_LOADED__?: boolean;
    __VYBE_STABLE_RELOAD__?: boolean;
    __VYBE_SPLASH_FORCE_HIDDEN__?: boolean;
  }
}

function isNativeSplashHandoffDom(): boolean {
  try {
    return document.documentElement.getAttribute('data-vybe-splash') === 'native-handoff';
  } catch {
    return false;
  }
}

function applyToStaticBoot(progress: number, status: string): void {
  // Native/Despia handoff: brand + bar are CSS-hidden — skip DOM writes.
  if (isNativeSplashHandoffDom()) return;

  const boot = document.getElementById('vybe-static-boot');
  if (!boot) return;

  const fill = boot.querySelector('.vybe-splash-bar-fill') as HTMLElement | null;
  const statusEl = boot.querySelector('.vybe-splash-status');
  const pctEl = boot.querySelector('.vybe-splash-percent');
  const clamped = Math.max(0, Math.min(progress, 100));
  const scale = clamped / 100;

  if (fill) {
    fill.style.animation = 'none';
    fill.style.transition = 'none';
    fill.style.transform = `scaleX(${scale})`;
  }
  if (statusEl) statusEl.textContent = status;
  if (pctEl) pctEl.textContent = `${Math.round(clamped)}%`;
}

function readStaticBootProgress(): { progress: number; status: string } | null {
  const boot = document.getElementById('vybe-static-boot');
  if (!boot) return null;
  const pctEl = boot.querySelector('.vybe-splash-percent');
  const statusEl = boot.querySelector('.vybe-splash-status');
  const parsed = Number.parseInt((pctEl?.textContent || '').replace('%', ''), 10);
  if (!Number.isFinite(parsed)) return null;
  return {
    progress: parsed,
    status: (statusEl?.textContent || lastStatus).trim() || lastStatus,
  };
}

export function getLastSplashProgress(): { progress: number; status: string } {
  return { progress: lastProgress, status: lastStatus };
}

export function publishSplashProgress(progress: number, status: string): void {
  const previousProgress = lastProgress;
  lastProgress = Math.max(0, Math.min(100, progress));
  lastStatus = status;

  applyToStaticBoot(lastProgress, lastStatus);

  // Stop the index.html fake ticker as soon as React owns progress or main eval'd.
  try {
    if (typeof window !== 'undefined' && typeof window.__vybeStopFakeSplash === 'function') {
      if (
        window.__VYBE_MAIN_EVAL__ === true ||
        lastProgress !== previousProgress ||
        lastProgress >= 100
      ) {
        window.__vybeStopFakeSplash();
      }
    }
    if (typeof window !== 'undefined') {
      window.__vybeSplashProgress = lastProgress;
      window.__vybeSplashStatus = lastStatus;
    }
  } catch {
    /* ignore */
  }

  listeners.forEach((fn) => {
    try {
      fn(lastProgress, lastStatus);
    } catch {
      /* ignore */
    }
  });
}

export function hideStaticBootSplash(): void {
  const boot = document.getElementById('vybe-static-boot');
  if (!boot) return;
  boot.classList.add('vybe-static-boot-fade');
  // Inline styles beat stalled CSS transitions when the WebView is backgrounded.
  boot.style.opacity = '0';
  boot.style.pointerEvents = 'none';
  boot.style.visibility = 'hidden';

  const removeNow = () => {
    try {
      boot.remove();
    } catch {
      /* ignore */
    }
  };

  // iOS WKWebView / ATT cold-start often reports visibilityState === 'hidden'.
  // setTimeout/rAF are deferred in that state, leaving #vybe-static-boot as a
  // fullscreen black cover over an already-mounted React tree.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    removeNow();
    return;
  }

  window.setTimeout(removeNow, 240);
}

export function subscribeSplashProgress(listener: SplashProgressListener): () => void {
  listeners.add(listener);
  listener(lastProgress, lastStatus);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') {
  if (typeof window.__vybeSplashProgress === 'number') {
    lastProgress = window.__vybeSplashProgress;
  }
  if (typeof window.__vybeSplashStatus === 'string' && window.__vybeSplashStatus) {
    lastStatus = window.__vybeSplashStatus;
  } else {
    const fromDom = readStaticBootProgress();
    if (fromDom) {
      lastProgress = fromDom.progress;
      lastStatus = fromDom.status;
    }
  }

  window.__vybePublishSplashProgress = publishSplashProgress;
}
