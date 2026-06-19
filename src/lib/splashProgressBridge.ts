/** Imperative splash progress — avoids re-rendering the full splash tree every frame. */

type SplashProgressListener = (progress: number, status: string) => void;

const listeners = new Set<SplashProgressListener>();

export function publishSplashProgress(progress: number, status: string): void {
  const boot = document.getElementById('vybe-static-boot');
  if (boot) {
    const fill = boot.querySelector('.vybe-splash-bar-fill') as HTMLElement | null;
    const statusEl = boot.querySelector('.vybe-splash-status');
    const pctEl = boot.querySelector('.vybe-splash-percent');
    if (fill) fill.style.transform = `scaleX(${Math.max(0, Math.min(progress, 100)) / 100})`;
    if (statusEl) statusEl.textContent = status;
    if (pctEl) pctEl.textContent = `${Math.round(progress)}%`;
  }

  listeners.forEach((fn) => {
    try {
      fn(progress, status);
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
  return () => listeners.delete(listener);
}
