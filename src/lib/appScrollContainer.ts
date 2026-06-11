/** Main app scroll surface (AppLayout `<main>`), not `window`. */

export function getAppScrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('[data-app-scroll-container="true"]');
}

export function getAppScrollTop(): number {
  const el = getAppScrollContainer();
  return el ? el.scrollTop : (document.scrollingElement?.scrollTop ?? window.scrollY ?? 0);
}

export function scrollAppTo(top: number, behavior: ScrollBehavior = 'auto'): void {
  const el = getAppScrollContainer();
  if (el) {
    el.scrollTo({ top, left: 0, behavior });
    return;
  }
  window.scrollTo({ top, left: 0, behavior });
}
