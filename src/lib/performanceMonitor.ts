/**
 * Internal performance diagnostics — FPS, frame time, dropped frames, memory.
 * Enable via localStorage vybe_perf_monitor=1 or ?vybe_perf=1
 */

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  droppedFrames: number;
  longTasks: number;
  memoryMb: number | null;
  navScrollHidden: boolean;
  warnings: string[];
}

type Listener = (snap: PerfSnapshot) => void;

let enabled = false;
let rafId = 0;
let lastFrame = 0;
let frameCount = 0;
let fps = 60;
let frameMs = 16;
let dropped = 0;
let longTasks = 0;
const listeners = new Set<Listener>();
let observer: PerformanceObserver | null = null;

function readMemoryMb(): number | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (!mem?.usedJSHeapSize) return null;
  return Math.round(mem.usedJSHeapSize / 1024 / 1024);
}

function collectWarnings(snap: PerfSnapshot): string[] {
  const w: string[] = [];
  if (snap.fps < 50) w.push(`Low FPS: ${snap.fps}`);
  if (snap.frameMs > 20) w.push(`Slow frame: ${snap.frameMs.toFixed(1)}ms`);
  if (snap.droppedFrames > 30) w.push(`Dropped frames: ${snap.droppedFrames}`);
  if (snap.memoryMb != null && snap.memoryMb > 280) w.push(`High memory: ${snap.memoryMb}MB`);
  return w;
}

function emit() {
  const snap: PerfSnapshot = {
    fps,
    frameMs,
    droppedFrames: dropped,
    longTasks,
    memoryMb: readMemoryMb(),
    navScrollHidden:
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-vybe-bottom-nav-scroll') === 'hidden',
    warnings: [],
  };
  snap.warnings = collectWarnings(snap);
  if (snap.warnings.length && import.meta.env.DEV) {
    console.debug('[VYBE:perf]', snap.warnings.join(' · '));
  }
  listeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      /* ignore */
    }
  });
}

function tick(now: number) {
  if (!enabled) return;
  if (lastFrame) {
    const delta = now - lastFrame;
    frameMs = frameMs * 0.85 + delta * 0.15;
    if (delta > 24) dropped += 1;
    frameCount += 1;
    if (frameCount >= 30) {
      fps = Math.round((1000 / frameMs) * 10) / 10;
      frameCount = 0;
      emit();
    }
  }
  lastFrame = now;
  rafId = requestAnimationFrame(tick);
}

export function isPerfMonitorEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem('vybe_perf_monitor') === '1') return true;
    return new URLSearchParams(window.location.search).has('vybe_perf');
  } catch {
    return false;
  }
}

export function startPerformanceMonitor(): () => void {
  if (enabled || typeof window === 'undefined') return () => {};
  enabled = true;
  dropped = 0;
  longTasks = 0;
  rafId = requestAnimationFrame(tick);

  if ('PerformanceObserver' in window) {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'longtask' || entry.duration > 50) longTasks += 1;
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      /* longtask not supported */
    }
  }

  return () => {
    enabled = false;
    cancelAnimationFrame(rafId);
    observer?.disconnect();
    observer = null;
  };
}

export function subscribePerformanceMonitor(listener: Listener): () => void {
  listeners.add(listener);
  const stop = startPerformanceMonitor();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function markPerfEvent(label: string, ms?: number) {
  if (!isPerfMonitorEnabled()) return;
  console.debug(`[VYBE:perf] ${label}`, ms != null ? `${ms.toFixed(1)}ms` : '');
}
