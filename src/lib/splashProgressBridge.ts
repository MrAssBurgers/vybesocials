/** Imperative splash progress — avoids re-rendering the full splash tree every frame. */

type SplashProgressListener = (progress: number, status: string) => void;

const listeners = new Set<SplashProgressListener>();

let lastProgress = 0;
let lastStatus = 'Waking up...';

function applyToStaticBoot(progress: number, status: string): void {
  const boot = document.getElementById('vybe-static-boot');
  if (!boot) return;

  const fill = boot.querySelector('.vybe-splash-bar-fill') as HTMLElement | null;
  const statusEl = boot.querySelector('.vybe-splash-status');
  const pctEl = boot.querySelector('.vybe-splash-percent');
  const clamped = Math.max(0, Math.min(progress, 100));
  const scale = clamped / 100;

  if (fill) {
    fill.style.animation = 'none';
    fill.style.transform = `scaleX(${scale})`;
  }
  if (statusEl) statusEl.textContent = status;
  if (pctEl) pctEl.textContent = `${Math.round(clamped)}%`;
}

export function getLastSplashProgress(): { progress: number; status: string } {
  return { progress: lastProgress, status: lastStatus };
}

export function publishSplashProgress(progress: number, status: string): void {
  lastProgress = Math.max(0, Math.min(100, progress));
  lastStatus = status;

  applyToStaticBoot(lastProgress, lastStatus);

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
  if (boot) boot.remove();
}

export function subscribeSplashProgress(listener: SplashProgressListener): () => void {
  listeners.add(listener);
  listener(lastProgress, lastStatus);
  return () => listeners.delete(listener);
}
