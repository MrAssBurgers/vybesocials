/**
 * Boot watchdog — startup only. Does NOT interrupt the app after first successful paint.
 * Inlined into dist/index.html by scripts/inline-boot-guard.mjs on build.
 */
(function bootGuard() {
  var BOOT_ATTR = 'data-vybe-boot';
  var APP_READY_ATTR = 'data-vybe-app-ready';
  var RECOVERY_ID = 'vybe-boot-recovery';
  var AUTO_RETRY_KEY = 'vybe.boot.auto-retry';
  var startupTimer = null;
  var pollTimer = null;
  var recoveryShown = false;
  var bootEverSucceeded = false;
  var bundleLoaded = false;
  var bundleFailed = false;
  var bootStartedAt = Date.now();

  var ua = (navigator.userAgent || '').toLowerCase();
  var isNativeWrapper =
    /despia|vybeapp|median|gonative|wv\)|; wv\b/.test(ua) ||
    !!(window).Despia ||
    !!(window).__DESPIA__;
  var STARTUP_TIMEOUT_MS = isNativeWrapper ? 35000 : 30000;

  function isAppReady() {
    return (
      bootEverSucceeded ||
      document.documentElement.getAttribute(APP_READY_ATTR) === 'true'
    );
  }

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

  function showRecoveryUi(reason, detailExtra) {
    clearStuckUiState();
    recoveryShown = true;
    var el = document.getElementById(RECOVERY_ID);
    if (!el) return;
    el.style.display = 'flex';
    document.documentElement.setAttribute(BOOT_ATTR, 'failed');
    var detail = document.getElementById('vybe-boot-recovery-detail');
    if (!detail) return;
    var host = '';
    try { host = location.hostname || ''; } catch (e0) { host = ''; }
    var onLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (reason === 'startup_timeout') {
      detail.textContent =
        'Startup timed out. Tap "Clear cache & reload" once. If it repeats after publishing, check Firebase env vars in Lovable.';
    } else if (reason === 'script_error' || reason === 'chunk_error') {
      detail.textContent = onLocalhost
        ? 'Offline cache is missing the app shell (often /assets/app.js). In Despia set Offline Support to PWA, or Publish a fresh despia/local.json that includes app.js — then Clear cache & reload.'
        : 'A script failed to load. Clear cache and reload to get the latest build.';
    } else {
      detail.textContent = 'Something blocked startup. Clear cache and reload.';
    }
    if (detailExtra) {
      detail.textContent += ' [' + detailExtra + ']';
    }
    // #region agent log
    try {
      fetch('http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'adb115' },
        body: JSON.stringify({
          sessionId: 'adb115',
          runId: 'boot-fail',
          hypothesisId: 'H6',
          location: 'boot-guard.js:showRecoveryUi',
          message: 'boot_recovery_shown',
          data: {
            reason: reason,
            host: host,
            onLocalhost: onLocalhost,
            detailExtra: detailExtra || null,
            href: String(location.href || '').slice(0, 160),
          },
          timestamp: Date.now(),
        }),
      }).catch(function () {});
    } catch (e1) {}
    // #endregion
  }

  function showRecovery(reason, manual, detailExtra) {
    if (isAppReady() && !manual) return;
    if (!manual && (reason === 'script_error' || reason === 'chunk_error' || reason === 'startup_timeout')) {
      try {
        var tries = parseInt(sessionStorage.getItem(AUTO_RETRY_KEY) || '0', 10);
        if (tries < 1) {
          sessionStorage.setItem(AUTO_RETRY_KEY, String(tries + 1));
          var el = document.getElementById(RECOVERY_ID);
          var detail = document.getElementById('vybe-boot-recovery-detail');
          if (el) el.style.display = 'flex';
          if (detail) detail.textContent = 'Fetching the latest version…';
          recoveryShown = true;
          setTimeout(clearCacheAndReload, 600);
          return;
        }
      } catch (e) { /* ignore */ }
    }
    showRecoveryUi(reason, detailExtra);
  }

  function isRecoveryVisible() {
    var el = document.getElementById(RECOVERY_ID);
    return !!(el && el.style.display === 'flex');
  }

  function isSplashVisible() {
    if (document.body.classList.contains('splash-visible')) return true;
    var root = document.getElementById('root');
    if (!root) return false;
    var text = root.textContent || '';
    return /VYBE/i.test(text) && /Waking up|Checking session|Loading|Ready|Let's go|Tip/i.test(text);
  }

  function isBundleStillLoading() {
    if (bundleFailed) return false;
    if (bundleLoaded) return false;
    return Date.now() - bootStartedAt < STARTUP_TIMEOUT_MS;
  }

  function hasMeaningfulContent() {
    var root = document.getElementById('root');
    if (!root) return false;

    if (root.querySelector('[data-vybe-boot-screen]')) return true;
    if (isSplashVisible()) return true;

    var shell = document.getElementById('app-shell');
    if (shell && shell.querySelector('[data-route-shell], #main-content, [data-auth-shell], main, nav[aria-label]')) {
      return true;
    }

    if (root.querySelector('input, textarea, button, a[href], img, video, canvas, [data-route-shell], #main-content, [data-auth-shell]')) {
      return true;
    }

    var rootText = (root.textContent || '').replace(/\s+/g, '');
    return rootText.length > 8;
  }

  function markBootReady() {
    if (!hasMeaningfulContent()) return;
    bootEverSucceeded = true;
    try { sessionStorage.removeItem(AUTO_RETRY_KEY); } catch (e) { /* ignore */ }
    document.documentElement.setAttribute(BOOT_ATTR, 'ready');
    hideRecovery();
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function pollVisibility() {
    if (isAppReady()) return;
    if (isRecoveryVisible()) return;
    // Do not bail when visibilityState === 'hidden'. iOS WKWebView / ATT cold
    // starts often stay "hidden" while React already painted under the splash.
    if (hasMeaningfulContent()) {
      markBootReady();
    }
  }

  function watchBundleScripts() {
    var scripts = document.querySelectorAll('script[type="module"], script[src*="/assets/app.js"], script[src*="/assets/index-"]');
    for (var i = 0; i < scripts.length; i++) {
      (function (script) {
        script.addEventListener('load', function () { bundleLoaded = true; });
        script.addEventListener('error', function () {
          bundleFailed = true;
          if (!isAppReady()) {
            showRecovery('chunk_error', false, (script.src || '').split('/').pop() || 'module');
          }
        });
      })(scripts[i]);
    }
  }

  window.__VYBE_MARK_BOOT_COMPLETE__ = markBootReady;
  window.__VYBE_SHOW_BOOT_RECOVERY__ = function (reason) { showRecovery(reason, true); };
  window.__VYBE_CLEAR_CACHE_RELOAD__ = function () {
    try { sessionStorage.setItem(AUTO_RETRY_KEY, '2'); } catch (e) { /* ignore */ }
    clearCacheAndReload();
  };
  window.__VYBE_HAS_MEANINGFUL_CONTENT__ = hasMeaningfulContent;

  document.documentElement.setAttribute(BOOT_ATTR, 'pending');
  watchBundleScripts();

  pollTimer = setInterval(pollVisibility, 500);

  startupTimer = setTimeout(function () {
    if (isAppReady()) return;
    if (!hasMeaningfulContent() && !isSplashVisible() && !isBundleStillLoading()) {
      showRecovery('startup_timeout');
    }
  }, STARTUP_TIMEOUT_MS);

  window.addEventListener('error', function (event) {
    if (isAppReady()) return;
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
    if (isFatal && !hasMeaningfulContent()) {
      showRecovery('script_error');
      showRecoveryUi('script_error', (msg || file || 'error').slice(0, 80));
    }
  });

  window.addEventListener('unhandledrejection', function (event) {
    if (isAppReady()) return;
    var reason = event.reason;
    var msg = reason instanceof Error ? reason.message : String(reason || '');
    if (
      (msg.indexOf('Loading chunk') !== -1 ||
        msg.indexOf('Failed to fetch') !== -1 ||
        msg.indexOf('Importing a module script failed') !== -1) &&
      !hasMeaningfulContent()
    ) {
      showRecovery('chunk_error');
      showRecoveryUi('chunk_error', msg.slice(0, 80));
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var reloadBtn = document.getElementById('vybe-boot-reload');
    var clearBtn = document.getElementById('vybe-boot-clear-cache');
    if (reloadBtn) reloadBtn.addEventListener('click', function () { window.location.reload(); });
    if (clearBtn) clearBtn.addEventListener('click', function () { window.__VYBE_CLEAR_CACHE_RELOAD__(); });
  });
})();
