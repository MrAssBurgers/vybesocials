type Listener = () => void;

let restored = false;
const listeners = new Set<Listener>();

/** Called when IndexedDB cache restore finishes (success or empty). */
export function markPersistRestored(): void {
  if (restored) return;
  restored = true;
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function isPersistRestored(): boolean {
  return restored;
}

export function onPersistRestored(cb: Listener): () => void {
  if (restored) {
    cb();
    return () => undefined;
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}
