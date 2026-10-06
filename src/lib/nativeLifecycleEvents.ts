let installed = false;

/** Native shells can dispatch document events without DOM bubbling. */
export function installNativeLifecycleEvents(): () => void {
  if (installed) return () => {};
  installed = true;
  const forward = (event: Event) => {
    // Bubbling events already reach window. Forwarding those would refresh
    // twice. Window events never reach this listener, so no redispatch loop.
    if (!event.bubbles) {
      window.dispatchEvent(new CustomEvent(event.type, { detail: (event as CustomEvent).detail }));
    }
  };
  document.addEventListener('app-paused', forward);
  document.addEventListener('app-resumed', forward);
  return () => {
    document.removeEventListener('app-paused', forward);
    document.removeEventListener('app-resumed', forward);
    installed = false;
  };
}
