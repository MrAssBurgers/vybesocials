/**
 * Pre-React + runtime blank-screen watchdog.
 * Inlined into dist/index.html by scripts/inline-boot-guard.mjs on build.
 */
(function bootGuard() {
  var BOOT_ATTR = 'data-vybe-boot';
  var RECOVERY_ID = 'vybe-boot-recovery';
  var AUTO_RETRY_KEY = 'vybe.boot.auto-retry';
  var startupTimer = null;
  var pollTimer = null;
  var recoveryShown = false;
  var blankStreak = 0;
  var bundleLoaded = false;
  var bundleFailed = false;
  var bootStartedAt = Date.now();

  var ua = (navigator.userAgent || '').toLowerCase();
  var isNativeWrapper =
    /despia|vybeapp|median|gonative|wv\)|; wv\b/.test(ua) ||
    !!(window).Despia ||
    !!(window).__DESPIA__;
  var STARTUP_TIMEOUT_MS = isNativeWrapper ? 22000 : 18000;
  var BLANK_STREAK_LIMIT = 8;

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

  function autoRetryOrShow(reason, manual) {
    if (!manual) {
      try {
        var tries = parseInt(sessionStorage.getItem(AUTO_RETRY_KEY) || '0', 10);
        if (tries < 2) {
          sessionStorage.setItem(AUTO_RETRY_KEY, String(tries + 1));
          var el = document.getElementById(RECOVERY_ID);
          var detail = document.getElementById('vybe-boot-recovery-detail');
          if (el) el.style.display = 'flex';
          if (detail) {
            detail.textContent = 'Clearing outdated cache and fetching the latest version…';
          }
          recoveryShown = true;
          setTimeout(clearCacheAndReload, 500);
          return;
        }
      } catch (e) { /* ignore */ }
    }
    showRecoveryUi(reason);
  }

  function showRecoveryUi(reason) {
    clearStuckUiState();
    recoveryShown = true;
    var el = document.getElementById(RECOVERY_ID);
    if (!el) return;
    el.style.display = 'flex';
    document.documentElement.setAttribute(BOOT_ATTR, 'failed');
    var detail = document.getElementById('vybe-boot-recovery-detail');
    if (!detail) return;
    if (reason === 'startup_timeout') {
      detail.textContent =
        'Startup timed out — usually a stale cached build. Tap "Clear cache & reload". If it repeats, republish from Lovable with Firebase env vars.';
    } else if (reason === 'blank_shell') {
      detail.textContent = 'The app loaded but the screen stayed blank. Clear cache and reload.';
    } else if (reason === 'script_error' || reason === 'chunk_error') {
      detail.textContent = 'A script failed to load (common after updates). Clear cache and reload.';
    } else {
      detail.textContent = 'Something blocked the UI. Clear cache and reload.';
    }
  }

  function showRecovery(reason, manual) {
    autoRetryOrShow(reason, manual);
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
    return /VYBE/i.test(text) && /Waking up|Checking session|Loading|Ready|Let's go/i.test(text);
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

    var main = document.getElementById('main-content');
    if (main) {
      var mainText = (main.textContent || '').replace(/\s+/g, '');
      if (mainText.length > 12) return true;
      if (main.querySelector('img, video, canvas, svg, button, a[href], input, textarea')) {
        return true;
      }
    }

    var route = document.querySelector('[data-route-shell]');
    if (route) {
      var routeText = (route.textContent || '').replace(/\s+/g, '');
      if (routeText.length > 12) return true;
    }

    var rootText = (root.textContent || '').replace(/\s+/g, '');
    if (rootText.length > 24) return true;

    return false;
  }

  function markBootReady() {
    if (hasMeaningfulContent()) {
      try { sessionStorage.removeItem(AUTO_RETRY_KEY); } catch (e) { /* ignore */ }
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

    if (isSplashVisible() || isBundleStillLoading()) {
      blankStreak = 0;
      return;
    }

    blankStreak += 1;
    if (blankStreak >= BLANK_STREAK_LIMIT) {
      showRecovery('blank_shell');
    }
  }

  function watchBundleScripts() {
    var scripts = document.querySelectorAll('script[type="module"], script[src*="/assets/index-"]');
    for (var i = 0; i < scripts.length; i++) {
      (function (script) {
        script.addEventListener('load', function () { bundleLoaded = true; });
        script.addEventListener('error', function () {
          bundleFailed = true;
          showRecovery('chunk_error');
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

  pollTimer = setInterval(pollVisibility, 800);

  startupTimer = setTimeout(function () {
    if (!hasMeaningfulContent() && !isSplashVisible() && !isBundleStillLoading()) {
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
    if (reloadBtn) {
      reloadBtn.addEventListener('click', function () { window.location.reload(); });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        window.__VYBE_CLEAR_CACHE_RELOAD__();
      });
    }
  });
})();
