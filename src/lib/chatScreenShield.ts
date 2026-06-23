/**
 * Chat screenshot blocking — native OS shield (Despia / Capacitor) plus instant web blackout.
 *
 * Native (Android FLAG_SECURE / iOS screen shield): screenshots save as black while chat is open.
 * Web/PWA: synchronous full-screen black curtain on capture signals (best-effort).
 */
import { isDespiaRuntime, despiaCall } from '@/lib/despiaBridge';

export const CHAT_SHIELD_ROOT_ID = 'vybe-chat-shield-root';
const CURTAIN_ID = 'vybe-chat-shield-curtain';

let activeCount = 0;
let listenersAttached = false;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

const ENABLE_SCHEMES = [
  'screenshield://on',
  'screenshield://enable',
  'preventscreenshots://on',
  'screenprotect://on',
] as const;

const DISABLE_SCHEMES = [
  'screenshield://off',
  'screenshield://disable',
  'preventscreenshots://off',
  'screenprotect://off',
] as const;

function fireDespiaSchemes(schemes: readonly string[]): void {
  if (!isDespiaRuntime()) return;
  for (const scheme of schemes) {
    void despiaCall(scheme, [], 250);
  }
}

function ensureCurtain(): HTMLDivElement {
  let curtain = document.getElementById(CURTAIN_ID) as HTMLDivElement | null;
  if (curtain) return curtain;

  curtain = document.createElement('div');
  curtain.id = CURTAIN_ID;
  curtain.setAttribute('aria-hidden', 'true');
  Object.assign(curtain.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    background: '#000',
    display: 'none',
    pointerEvents: 'none',
  });
  document.body.appendChild(curtain);
  return curtain;
}

/** Hide chat pixels immediately — must stay synchronous (no React state). */
export function blackoutChatScreenNow(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-chat-shield', 'blocking');
  const curtain = ensureCurtain();
  curtain.style.display = 'block';
  const root = document.getElementById(CHAT_SHIELD_ROOT_ID);
  if (root) root.style.visibility = 'hidden';
}

export function restoreChatScreen(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-chat-shield', 'active');
  const curtain = document.getElementById(CURTAIN_ID);
  if (curtain) curtain.style.display = 'none';
  const root = document.getElementById(CHAT_SHIELD_ROOT_ID);
  if (root) root.style.visibility = '';
}

function scheduleRestore(delayMs = 600): void {
  if (restoreTimer) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    if (activeCount > 0 && !document.hidden) restoreChatScreen();
  }, delayMs);
}

function isScreenshotShortcut(e: KeyboardEvent): boolean {
  if (e.key === 'PrintScreen') return true;
  if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) return true;
  if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') return true;
  return false;
}

function onKeyDown(e: KeyboardEvent): void {
  if (!isScreenshotShortcut(e)) return;
  blackoutChatScreenNow();
  scheduleRestore(1200);
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key !== 'PrintScreen') return;
  blackoutChatScreenNow();
  scheduleRestore(1200);
}

function onVisibilityChange(): void {
  if (document.hidden) {
    blackoutChatScreenNow();
    return;
  }
  scheduleRestore(400);
}

function onPageHide(): void {
  blackoutChatScreenNow();
}

let lastHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
function onResize(): void {
  const diff = Math.abs(window.innerHeight - lastHeight);
  if (diff > 15 && diff < 120) {
    blackoutChatScreenNow();
    scheduleRestore(700);
  }
  lastHeight = window.innerHeight;
}

function attachWebListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  ensureCurtain();
  document.documentElement.setAttribute('data-chat-shield', 'active');

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('visibilitychange', onVisibilityChange, true);
  window.addEventListener('pagehide', onPageHide, true);
  window.addEventListener('resize', onResize, true);
}

function detachWebListeners(): void {
  if (!listenersAttached || typeof window === 'undefined') return;
  listenersAttached = false;

  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('keyup', onKeyUp, true);
  document.removeEventListener('visibilitychange', onVisibilityChange, true);
  window.removeEventListener('pagehide', onPageHide, true);
  window.removeEventListener('resize', onResize, true);

  if (restoreTimer) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }
  document.documentElement.removeAttribute('data-chat-shield');
  restoreChatScreen();
}

function enableNativeShield(): void {
  fireDespiaSchemes(ENABLE_SCHEMES);
}

function disableNativeShield(): void {
  fireDespiaSchemes(DISABLE_SCHEMES);
}

/** Turn on screenshot blocking (ref-counted for nested viewers). */
export function acquireChatScreenShield(): void {
  activeCount += 1;
  if (activeCount !== 1) return;
  enableNativeShield();
  attachWebListeners();
}

/** Turn off screenshot blocking when leaving chat / closing viewer. */
export function releaseChatScreenShield(): void {
  if (activeCount <= 0) return;
  activeCount -= 1;
  if (activeCount !== 0) return;
  disableNativeShield();
  detachWebListeners();
}
