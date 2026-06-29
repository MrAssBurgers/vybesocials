/**
 * Global keyboard avoidance — single install in AppLayout.
 *
 * Watches focusin on inputs/textareas/contenteditable elements and, after the
 * soft keyboard animates in, scrolls the focused field into view above the
 * keyboard with comfortable padding. Works on iOS Safari, Android Chrome,
 * Despia, and Capacitor native runtimes (relies on visualViewport + --kb-h
 * published by useKeyboardHeight).
 *
 * Any sticky/floating composer or footer can opt in to auto-lift by adding
 * `data-keyboard-dock` — handled in index.css.
 */
import { shouldTrackSoftKeyboard } from '@/lib/keyboardInsets';

const PAD = 16; // comfort padding above keyboard
const SETTLE_MS = 180;

function isEditable(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'time'].includes(t);
  }
  return el.isContentEditable;
}

function getKeyboardHeight(): number {
  const root = document.documentElement;
  const v = getComputedStyle(root).getPropertyValue('--kb-h').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function isInsideVybeChatComposer(el: HTMLElement): boolean {
  return Boolean(
    el.closest('.vybe-chat-composer, .ai-chat-composer, .dm-composer-dock'),
  );
}

function ensureVisible(el: HTMLElement) {
  const kb = getKeyboardHeight();
  const visibleBottom = window.innerHeight - kb - PAD;
  const rect = el.getBoundingClientRect();
  if (rect.bottom <= visibleBottom && rect.top >= PAD) return;

  const overflow = rect.bottom - visibleBottom;
  const scroller = findScrollableAncestor(el);
  if (scroller) {
    scroller.scrollBy({ top: overflow, behavior: 'smooth' });
  } else {
    window.scrollBy({ top: overflow, behavior: 'smooth' });
  }
}

let installed = false;

export function installKeyboardFocusScroll(): () => void {
  if (installed || typeof window === 'undefined') return () => {};
  if (!shouldTrackSoftKeyboard()) return () => {};
  installed = true;

  let pending: number | null = null;
  let targetEl: HTMLElement | null = null;

  const schedule = (el: HTMLElement) => {
    targetEl = el;
    if (pending) window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      pending = null;
      if (targetEl && document.activeElement === targetEl) {
        ensureVisible(targetEl);
      }
    }, SETTLE_MS);
  };

  const onFocusIn = (e: FocusEvent) => {
    if (!isEditable(e.target)) return;
    const target = e.target as HTMLElement;
    if (isInsideVybeChatComposer(target)) return;
    schedule(target);
  };

  const onViewportResize = () => {
    if (targetEl && document.activeElement === targetEl) {
      ensureVisible(targetEl);
    }
  };

  document.addEventListener('focusin', onFocusIn, true);
  window.visualViewport?.addEventListener('resize', onViewportResize);
  window.visualViewport?.addEventListener('scroll', onViewportResize);

  return () => {
    installed = false;
    if (pending) window.clearTimeout(pending);
    document.removeEventListener('focusin', onFocusIn, true);
    window.visualViewport?.removeEventListener('resize', onViewportResize);
    window.visualViewport?.removeEventListener('scroll', onViewportResize);
  };
}
