export type ReadPhase = Readonly<{ foreground: boolean; generation: number }>;
let nativePaused = false;
let phase: ReadPhase = Object.freeze({ foreground: typeof document !== 'undefined' && document.visibilityState !== 'hidden', generation: 0 });
const subscribers = new Set<() => void>();
const serverPhase: ReadPhase = Object.freeze({ foreground: false, generation: 0 });
function change(event: Event) {
  if (event.type === 'app-paused') nativePaused = true;
  else if (event.type === 'app-resumed') nativePaused = false;
  const foreground = !nativePaused && document.visibilityState !== 'hidden';
  // Native shells can resume without having delivered a pause to this page.
  // A resume still needs a fresh checked read rather than retaining a failure.
  if (foreground === phase.foreground && event.type !== 'app-resumed') return;
  phase = Object.freeze({ foreground, generation: phase.generation + 1 });
  for (const notify of [...subscribers]) notify();
}
// Keep the native phase while a screen unmounts. This is one shared set of
// listeners for the page, rather than a new timer/listener set for every read.
if (typeof window !== 'undefined') {
  window.addEventListener('app-paused', change);
  window.addEventListener('app-resumed', change);
  document.addEventListener('visibilitychange', change);
}
export function foregroundReadPhaseCurrent(captured: ReadPhase) {
  return captured === phase && phase.foreground && !nativePaused && document.visibilityState !== 'hidden';
}
export const getForegroundReadPhase = () => phase;
export const getServerReadPhase = () => serverPhase;
export function subscribeForegroundReadPhase(notify: () => void) {
  subscribers.add(notify);
  return () => { subscribers.delete(notify); };
}
export function isAppForeground() {
  return foregroundReadPhaseCurrent(phase);
}
