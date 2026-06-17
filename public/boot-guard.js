/**
 * Pre-React boot watchdog — runs before the Vite module bundle.
 * If main.tsx fails to parse/execute or React never paints, show recovery UI
 * instead of an empty black screen (all devices: web, PWA, Despia WebView).
 */
(function bootGuard() {
  var BOOT_ATTR = 'data-vybe-boot';
  var RECOVERY_ID = 'vybe-boot-recovery';
  var watchdogTimer = null;
  var pollTimer = null;
  var bootComplete = false;
  var recoveryShown = false;

  var ua = (navigator.userAgent || '').toLowerCase();
  var isNativeWrapper =
    /despia|vybeapp|median|gonative|wv\)|; wv\b/.test(ua) ||
    !!(window).Despia ||
    !!(window).__DESPIA__;
  var BOOT_TIMEOUT_MS = isNativeWrapper ? 14000 : 10000;

  function hideRecovery() {
    var el = document.getElementById(RECOVERY_ID);
    if (el) el.style.display = 'none';
  }

  function showRecovery(reason) {
    if (bootComplete || recoveryShown) return;
    recoveryShown = true;
    var el = document.getElementById(RECOVERY_ID);
    if (!el) return;
    el.style.display = 'flex';
    document.documentElement.setAttribute(BOOT_ATTR, 'failed');
    var detail = document.getElementById('vybe-boot-recovery-detail');
    if (detail && reason) {
      detail.textContent = reason === 'startup_timeout'
        ? 'The app took too long to start. This is usually a cached update — try clearing cache.'
        : 'Something blocked startup. Reload or clear cache to recover.';
    }
    try {
      document.body.classList.remove('splash-visible');
      var root = document.getElementById('root');
      if (root) {
        root.style.visibility = '';
        root.style.opacity = '';
      }
    } catch (e) { /* ignore */ }
  }

  function clearTimers() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    if (pollTimer) clearInterval(pollTimer);
    watchdogTimer = null;
    pollTimer = null;
  }

  function markComplete() {
    if (bootComplete) return;
    bootComplete = true;
    clearTimers();
    hideRecovery();
    document.documentElement.setAttribute(BOOT_ATTR, 'ready');
  }

  function isAppVisible() {
    if (bootComplete) return true;
    var root = document.getElementById('root');
    if (!root) return false;
    if (root.querySelector('[data-vybe-boot-screen]')) return true;
    if (document.getElementById('app-shell')) return true;
    if (root.querySelector('[data-app-shell]')) return true;
    if (root.querySelector('[role="alert"]')) return true;
    var text = (root.textContent || '').replace(/\s+/g, '');
    if (text.length > 8) return true;
    var kids = root.children;
    for (var i = 0; i < kids.length; i++) {
      var rect = kids[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }

  function clearCacheAndReload() {
    var reload = function () {
      window.location.reload();
    };
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
    if (tasks.length) {
      Promise.all(tasks).finally(reload);
    } else {
      reload();
    }
  }

  window.__VYBE_MARK_BOOT_COMPLETE__ = markComplete;
  window.__VYBE_SHOW_BOOT_RECOVERY__ = showRecovery;
  window.__VYBE_CLEAR_CACHE_RELOAD__ = clearCacheAndReload;

  document.documentElement.setAttribute(BOOT_ATTR, 'pending');

  pollTimer = setInterval(function () {
    if (isAppVisible()) markComplete();
  }, 400);

  watchdogTimer = setTimeout(function () {
    if (!bootComplete && !isAppVisible()) {
      showRecovery('startup_timeout');
    }
  }, BOOT_TIMEOUT_MS);

  window.addEventListener('error', function (event) {
    if (bootComplete) return;
    var msg = String(event.message || '');
    var file = String(event.filename || '');
    var isBootFatal =
      file.indexOf('/assets/') !== -1 ||
      file.indexOf('main') !== -1 ||
      msg.indexOf('Loading chunk') !== -1 ||
      msg.indexOf('Failed to fetch') !== -1 ||
      msg.indexOf('Importing a module script failed') !== -1 ||
      msg.indexOf('is not defined') !== -1 ||
      msg.indexOf('Unexpected token') !== -1;
    if (isBootFatal) showRecovery('script_error');
  });

  window.addEventListener('unhandledrejection', function (event) {
    if (bootComplete) return;
    var reason = event.reason;
    var msg = reason instanceof Error ? reason.message : String(reason || '');
    if (
      msg.indexOf('Loading chunk') !== -1 ||
      msg.indexOf('Failed to fetch') !== -1 ||
      msg.indexOf('Importing a module script failed') !== -1
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
