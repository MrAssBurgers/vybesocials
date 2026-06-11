/**
 * Recover UI after iOS system permission sheets (ATT, camera, etc.).
 * WebViews can resume with stuck splash/body scroll locks — this clears them.
 */

import { pollNativeTrackingConsent, syncNativeTrackingConsent } from '@/lib/att';
import { scrollAppTo } from '@/lib/appScrollContainer';

export const ATT_RESUME_EVENT = 'vybe:resume-recover';

/** Clear splash locks / hidden #root after boot or system permission sheets. */
export function ensureAppShellVisible(): void {
  clearStuckDocumentState();
}

function clearStuckDocumentState() {
  document.body.style.overflow = '';
  document.body.classList.remove('splash-visible');

  if (document.body.style.position === 'fixed') {
    const top = document.body.style.top;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.documentElement.style.overflow = '';
    if (top) {
      const y = Number.parseInt(top.replace('px', ''), 10);
      if (!Number.isNaN(y)) scrollAppTo(-y, 'auto');
    }
  } else {
    document.documentElement.style.overflow = '';
  }

  const root = document.getElementById('root');
  if (root) {
    root.style.visibility = '';
    root.style.opacity = '';
  }
}

let stopConsentPoll: (() => void) | null = null;

export function recoverFromSystemPermissionSheet(): void {
  clearStuckDocumentState();
  syncNativeTrackingConsent();
  stopConsentPoll?.();
  stopConsentPoll = pollNativeTrackingConsent();
  window.setTimeout(() => {
    stopConsentPoll?.();
    stopConsentPoll = null;
  }, 3200);

  window.dispatchEvent(new CustomEvent(ATT_RESUME_EVENT));
  // Staggered pulses — WKWebView sometimes needs a second frame after ATT.
  for (const delay of [50, 180, 450, 1000]) {
    window.setTimeout(() => {
      clearStuckDocumentState();
      syncNativeTrackingConsent();
      window.dispatchEvent(new CustomEvent(ATT_RESUME_EVENT));
    }, delay);
  }
}

/** Install once at app boot. Safe to call multiple times — only one listener set. */
let installed = false;

export function installAttResumeRecovery(onRecover?: () => void): () => void {
  if (installed) {
    return () => {};
  }
  installed = true;

  let wasBackgrounded = false;

  const handleVisible = () => {
    if (!wasBackgrounded) return;
    wasBackgrounded = false;
    recoverFromSystemPermissionSheet();
    onRecover?.();
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      wasBackgrounded = true;
      return;
    }
    if (document.visibilityState === 'visible' && wasBackgrounded) {
      // ATT and other system sheets briefly hide the WebView.
      requestAnimationFrame(handleVisible);
    }
  };

  const onPageShow = (e: PageTransitionEvent) => {
    // bfcache restore only — not initial cold load (that caused premature splash dismiss).
    if (e.persisted && wasBackgrounded) {
      requestAnimationFrame(handleVisible);
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
    installed = false;
  };
}
