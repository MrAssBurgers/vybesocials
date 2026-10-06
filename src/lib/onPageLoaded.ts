/** Async boot imports can finish after load; run deferred setup in either case. */
export function onPageLoaded(setup: () => void): () => void {
  let active = true;
  const run = () => {
    if (!active) return;
    active = false;
    window.removeEventListener('load', run);
    setup();
  };
  if (document.readyState === 'complete') {
    queueMicrotask(run);
  } else {
    window.addEventListener('load', run, { once: true });
  }
  return () => {
    active = false;
    window.removeEventListener('load', run);
  };
}
