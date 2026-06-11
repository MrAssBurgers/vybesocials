/** Imperative splash progress — avoids re-rendering the full splash tree every frame. */

type SplashProgressListener = (progress: number, status: string) => void;

const listeners = new Set<SplashProgressListener>();

export function publishSplashProgress(progress: number, status: string): void {
  listeners.forEach((fn) => {
    try {
      fn(progress, status);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeSplashProgress(listener: SplashProgressListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
