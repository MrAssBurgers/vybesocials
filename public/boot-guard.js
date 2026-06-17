/**
 * Pre-React + runtime blank-screen watchdog.
 * Must be inlined in index.html AND kept at public/boot-guard.js (same file).
 */
(function bootGuard() {
  var BOOT_ATTR = 'data-vybe-boot';
  var RECOVERY_ID = 'vybe-boot-recovery';
  var startupTimer = null;
  var pollTimer = null;
  var recoveryShown = false;
  var blankStreak = 0;

  var ua = (navigator.userAgent || '').toLowerCase();
  var isNativeWrapper =
    /despia|vybeapp|median|gonative|wv\)|; wv\b/.test(ua) ||
    !!(window).Despia ||
    !!(window).__DESPIA__;
  var STARTUP_TIMEOUT_MS = isNativeWrapper ? 14000 : 10000;
  var BLANK_STREAK_LIMIT = 5;

  function hideRecovery() {
    var el = document.getElementById(RECOVERY_ID);
    if (el) el.style.display = 'none';
    recoveryShown = false;
  }

  function clearStuckUiState() {
    try {
      document.body.classList.remove('splash-visible', 'vybe-incoming-call-active', 'hide-bottom-nav');
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      var root = document.getElementById('root');
      if (root) {
        root.style.visibility = '';
        root.style.opacity = '';
        root.style.display = '';
      }
    } catch (e) { /* ignore */ }
  }

  function showRecovery(reason) {
    clearStuckUiState();
    recoveryShown = true;
    var el = document.getElementById(RECOVERY_ID);
    if (!el) return;
    el.style.display = 'flex';
    document.documentElement.setAttribute(BOOT_ATTR, 'failed');
    var detail = document.getElementById('vybe-boot-recovery-detail');
    if (!detail) return;
    if (reason === 'startup_timeout') {
      detail.textContent = 'The app took too long to start. This is usually a cached update — try clearing cache.';
    } else if (reason === 'blank_shell') {
      detail.textContent = 'The app loaded but nothing appeared on screen. Reload or clear cache to recover.';
    } else if (reason === 'script_error' || reason === 'chunk_error') {
      detail.textContent = 'A script failed to load (often after an update). Clear cache and reload.';
    } else {
      detail.textContent = 'Something blocked the UI. Reload or clear cache to continue.';
    }
  }

  function isRecoveryVisible() {
    var el = document.getElementById(RECOVERY_ID);
    return !!(el && el.style.display === 'flex');
  }

  function isSplashVisible() {
    return document.body.classList.contains('splash-visible');
  }

  /** True when users see real UI — not an empty transparent shell on black. */
  function hasMeaningfulContent() {
    var root = document.getElementById('root');
    if (!root) return false;

    if (root.querySelector('[data-vybe-boot-screen]')) return true;
    if (isSplashVisible()) return true;

    var main = document.getElementById('main-content');
    if (main) {
      var mainText = (main.textContent || '').replace(/\s+/g, '');
      if (mainText.length > 20) return true;
      if (main.querySelector('img, video, canvas, svg, button, a[href], input, textarea, [role="main"]')) {
        return true;
      }
    }

    var route = document.querySelector('[data-route-shell]');
    if (route) {
      var routeText = (route.textContent || '').replace(/\s+/g, '');
      if (routeText.length > 20) return true;
    }

    var rootText = (root.textContent || '').replace(/\s+/g, '');
    if (rootText.length > 40) return true;

    return false;
  }

  function clearCacheAndReload() {
    var reload = function () { window.location.reload(); };
    var tasks = [];
    try {
      if ('serviceWorker' in navigator) {
        tasks.push(
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            return Promise.all(regs.map(function (r) { return r.unregister(); }));
          })
        );
      }
      if ('caches' in window) {
        tasks.push(
          caches.keys().then(function (names) {
            return Promise.all(names.map(function (n) { return caches.delete(n); }));
          })
        );
      }
    } catch (e) { /* ignore */ }
    if (tasks.length) Promise.all(tasks).finally(reload);
    else reload();
  }

  function markBootReady() {
    if (hasMeaningfulContent()) {
      document.documentElement.setAttribute(BOOT_ATTR, 'ready');
      hideRecovery();
      blankStreak = 0;
    }
  }

  function pollVisibility() {
    if (document.visibilityState === 'hidden') return;
    if (isRecoveryVisible()) return;

    if (hasMeaningfulContent()) {
      blankStreak = 0;
      markBootReady();
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
      return;
    }

    if (isSplashVisible()) {
      blankStreak = 0;
      return;
    }

    blankStreak += 1;
    if (blankStreak >= BLANK_STREAK_LIMIT) {
      showRecovery('blank_shell');
    }
  }

  window.__VYBE_MARK_BOOT_COMPLETE__ = markBootReady;
  window.__VYBE_SHOW_BOOT_RECOVERY__ = showRecovery;
  window.__VYBE_CLEAR_CACHE_RELOAD__ = clearCacheAndReload;
  window.__VYBE_HAS_MEANINGFUL_CONTENT__ = hasMeaningfulContent;

  document.documentElement.setAttribute(BOOT_ATTR, 'pending');

  pollTimer = setInterval(pollVisibility, 800);

  startupTimer = setTimeout(function () {
    if (!hasMeaningfulContent() && !isSplashVisible()) {
      showRecovery('startup_timeout');
    }
  }, STARTUP_TIMEOUT_MS);

  window.addEventListener('error', function (event) {
    var msg = String(event.message || '');
    var file = String(event.filename || '');
    var isFatal =
      file.indexOf('/assets/') !== -1 ||
      file.indexOf('main') !== -1 ||
      msg.indexOf('Loading chunk') !== -1 ||
      msg.indexOf('Failed to fetch') !== -1 ||
      msg.indexOf('Importing a module script failed') !== -1 ||
      msg.indexOf('is not defined') !== -1 ||
      msg.indexOf('Unexpected token') !== -1;
    if (isFatal && !hasMeaningfulContent()) showRecovery('script_error');
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var msg = reason instanceof Error ? reason.message : String(reason || '');
    if (
      (msg.indexOf('Loading chunk') !== -1 ||
        msg.indexOf('Failed to fetch') !== -1 ||
        msg.indexOf('Importing a module script failed') !== -1) &&
      !hasMeaningfulContent()
    ) {
      showRecovery('chunk_error');
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var reloadBtn = document.getElementById('vybe-boot-reload');
    var clearBtn = document.getElementById('vybe-boot-clear-cache');
    if (reloadBtn) reloadBtn.addEventListener('click', function () { window.location.reload(); });
    if (clearBtn) clearBtn.addEventListener('click', clearCacheAndReload);
  });
})();
