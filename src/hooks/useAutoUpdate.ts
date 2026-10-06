import { useEffect } from 'react';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { isNativePlatform } from '@/lib/capacitor';
import { signalAppUpdate, APP_UPDATE_RELOAD_DELAY_MS } from '@/lib/appUpdateBridge';
import { clearAppCache } from '@/lib/selfHealingMonitor';

const RELOAD_GUARD_KEY = 'vybe-entry-reload';
const ENTRY_PATTERN = /^\/assets\/app-[\w-]+\.js$/;
const RETRY_DELAYS = [5_000, 15_000, 30_000];

function runningEntryPath(): string | null {
  for (const script of document.querySelectorAll('script[type="module"][src]')) {
    try {
      const url = new URL(script.getAttribute('src') || '', window.location.origin);
      if (url.origin === window.location.origin && ENTRY_PATTERN.test(url.pathname)) return url.pathname;
    } catch { /* Ignore malformed unrelated scripts. */ }
  }
  return null;
}

function readReloadGuard(): string | null | undefined {
  try { return sessionStorage.getItem(RELOAD_GUARD_KEY); } catch { return undefined; }
}

/** Retry returning-session checks without restarting native OTA or an edited form. */
export function useAutoUpdate() {
  useEffect(() => {
    if (import.meta.env.DEV || isDespiaRuntime() || isNativePlatform) return;
    let disposed = false, busy = false, failures = 0;
    const editedFields = new Set<Element>();
    let lastStarted = -Infinity;
    let retryTimer: number | undefined, reloadTimer: number | undefined;
    let requestController: AbortController | null = null;
    let pendingDraft = false, draftObserver: MutationObserver | undefined;

    const hasLiveEdits = () => {
      // A submitted login or closed editor is not an open draft. Keep cleared
      // fields protected while mounted, since deleting text may be unsaved.
      for (const field of editedFields) if (!field.isConnected) editedFields.delete(field);
      return editedFields.size > 0;
    };
    const hasDraft = () => hasLiveEdits() || document.activeElement?.matches('input,textarea,select,[contenteditable="true"]') ||
      Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="hidden"]),textarea')).some(field => Boolean(field.value)) ||
      Array.from(document.querySelectorAll('[contenteditable="true"]')).some(field => Boolean(field.textContent?.trim()));
    const markEdited = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const field = event.target.closest('input,textarea,select,[contenteditable="true"]');
      if (field) editedFields.add(field);
    };
    const resumeDeferred = () => {
      if (disposed || !pendingDraft || busy || hasDraft() || navigator.onLine === false || document.visibilityState === 'hidden') return;
      pendingDraft = false;
      draftObserver?.disconnect();
      // Re-fetch metadata: the deployment can change while a draft is open.
      void check(true);
    };
    const deferForDraft = () => {
      pendingDraft = true;
      draftObserver ??= new MutationObserver(resumeDeferred);
      draftObserver.observe(document.documentElement, { childList: true, subtree: true });
    };
    const leaveField = () => { if (pendingDraft) queueMicrotask(resumeDeferred); };

    const check = async (force = false) => {
      if (disposed || busy || reloadTimer !== undefined || navigator.onLine === false || document.visibilityState === 'hidden') return;
      if (!force && Date.now() - lastStarted < 30_000) return;
      busy = true;
      lastStarted = Date.now();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      const controller = new AbortController();
      requestController = controller;
      const deadline = window.setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(`/version.json?_=${Date.now()}`, {
          cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('Version check unavailable');
        const payload = await response.json() as { entry?: unknown };
        if (disposed) return;
        if (typeof payload.entry !== 'string' || !ENTRY_PATTERN.test(payload.entry)) throw new Error('Invalid app entry');
        failures = 0;
        const localEntry = runningEntryPath();
        // Metadata from a previous visit is not evidence that the running code is stale.
        if (!localEntry) return;
        if (localEntry === payload.entry) {
          try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* Storage may be blocked. */ }
          return;
        }
        const reloadGuard = readReloadGuard();
        // Without a durable loop guard, retain the usable page rather than restart it repeatedly.
        if (reloadGuard === undefined || reloadGuard === payload.entry) return;
        if (hasDraft()) { deferForDraft(); return; }
        await clearAppCache();
        if (disposed) return;
        if (hasDraft()) { deferForDraft(); return; }
        const remoteEntry = payload.entry;
        reloadTimer = window.setTimeout(() => {
          if (disposed) return;
          if (hasDraft()) { reloadTimer = undefined; deferForDraft(); return; }
          try { sessionStorage.setItem(RELOAD_GUARD_KEY, remoteEntry); } catch { reloadTimer = undefined; return; }
          signalAppUpdate();
          window.location.replace(`/?_vybe=${Date.now()}`);
        }, APP_UPDATE_RELOAD_DELAY_MS);
      } catch (error) {
        if (disposed) return;
        const delay = RETRY_DELAYS[failures++];
        if (delay !== undefined) retryTimer = window.setTimeout(() => { void check(true); }, delay);
        else console.warn('[AutoUpdate] Version check unavailable; waiting for reconnect', error);
      } finally {
        window.clearTimeout(deadline);
        requestController = null;
        busy = false;
      }
    };

    const reconnect = () => { if (pendingDraft) resumeDeferred(); else void check(true); };
    const resume = () => { if (pendingDraft) resumeDeferred(); else void check(); };
    retryTimer = window.setTimeout(() => { void check(true); }, 1_200);
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('input', markEdited, true);
    document.addEventListener('change', markEdited, true);
    document.addEventListener('focusout', leaveField, true);
    return () => {
      disposed = true;
      pendingDraft = false;
      draftObserver?.disconnect();
      requestController?.abort();
      window.clearTimeout(retryTimer);
      window.clearTimeout(reloadTimer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      document.removeEventListener('input', markEdited, true);
      document.removeEventListener('change', markEdited, true);
      document.removeEventListener('focusout', leaveField, true);
    };
  }, []);
}
