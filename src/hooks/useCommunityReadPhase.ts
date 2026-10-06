import { useSyncExternalStore } from 'react';

type ReadPhase = Readonly<{ foreground: boolean; generation: number }>;
let nativePaused = false;
let phase: ReadPhase = Object.freeze({ foreground: typeof document !== 'undefined' && document.visibilityState !== 'hidden', generation: 0 });
const subscribers = new Set<() => void>();
const serverPhase: ReadPhase = Object.freeze({ foreground: false, generation: 0 });
function change(event: Event) {
  if (event.type === 'app-paused') nativePaused = true;
  else if (event.type === 'app-resumed') nativePaused = false;
  const foreground = !nativePaused && document.visibilityState !== 'hidden';
  if (foreground === phase.foreground) return;
  phase = Object.freeze({ foreground, generation: phase.generation + 1 });
  for (const notify of [...subscribers]) notify();
}
// Keep the native phase while a hub screen unmounts. This is one shared set of
// listeners for the page, rather than a new timer/listener set for every read.
if (typeof window !== 'undefined') {
  window.addEventListener('app-paused', change);
  window.addEventListener('app-resumed', change);
  document.addEventListener('visibilitychange', change);
}
export function communityReadPhaseCurrent(captured: ReadPhase) {
  return captured === phase && phase.foreground && !nativePaused && document.visibilityState !== 'hidden';
}
export function useCommunityReadPhase() {
  return useSyncExternalStore(notify => { subscribers.add(notify); return () => { subscribers.delete(notify); }; }, () => phase, () => serverPhase);
}
