/**
 * Recover UI after iOS system permission sheets (ATT, camera, etc.).
 * WebViews can resume with stuck splash/body scroll locks — this clears them.
 */

export const ATT_RESUME_EVENT = 'vybe:resume-recover';

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
      if (!Number.isNaN(y)) window.scrollTo(0, -y);
    }
  } else {
    document.documentElement.style.overflow = '';
  }
}

export function recoverFromSystemPermissionSheet(): void {
  clearStuckDocumentState();
  window.dispatchEvent(new CustomEvent(ATT_RESUME_EVENT));
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
