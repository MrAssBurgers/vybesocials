/**
 * Boot watchdog — startup only. Does NOT interrupt the app after first successful paint.
 * Inlined into dist/index.html by scripts/inline-boot-guard.mjs on build.
 */
(function bootGuard() {
  // Despia sometimes lands /?login-approval=… as pathname /%3Flogin-approval=…
  try {
    var p = location.pathname || '';
    if (p.indexOf('%3F') !== -1 || p.indexOf('%3f') !== -1) {
      var decoded = decodeURIComponent(p);
      if (decoded.indexOf('/?') === 0) {
        var merged =
          decoded +
          (location.search && location.search !== '?' ? location.search.replace(/^\?/, '&') : '') +
          (location.hash || '');
        location.replace(merged);
        return;
      }
    }
  } catch (e) { /* ignore */ }

  // Recovery owns app files only, never account, media or other worker data.
  function clearOwnedBootFiles() {
    if (navigator.onLine === false) return Promise.resolve();
    var tasks = [];
    if ('serviceWorker' in navigator) {
      tasks.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.filter(function (reg) {
          try {
            var worker = reg.active || reg.waiting || reg.installing;
            var script = new URL(worker && worker.scriptURL, location.origin);
            var scope = new URL(reg.scope);
            return script.origin === location.origin && script.pathname === '/sw.js' &&
              scope.origin === location.origin && scope.pathname === '/';
          } catch (e) { return false; }
        }).map(function (reg) { return reg.unregister(); }));
      }).catch(function () {}));
    }
    if ('caches' in window) {
      tasks.push(caches.keys().then(function (names) {
        return Promise.all(names.filter(function (name) {
          return /^vybe-(?:shell-|assets-|static-|v\d+(?:$|-))/.test(name);
        }).map(function (name) { return caches.delete(name); }));
      }).catch(function () {}));
    }
    return Promise.all(tasks);
  }

  var editedBootFields = new Set();
  function markBootEdit(event) {
    var target = event.target;
    var field = target && typeof target.closest === 'function' && target.closest('input, textarea, select, [contenteditable="true"]');
    if (field) editedBootFields.add(field);
  }
  document.addEventListener('input', markBootEdit, true);
  document.addEventListener('change', markBootEdit, true);
  function hasBootDraft() {
    // Completed login forms and closed editors no longer block updates. A
    // cleared field stays protected until its editor is actually removed.
    editedBootFields.forEach(function (field) { if (!field.isConnected) editedBootFields.delete(field); });
    if (editedBootFields.size > 0) return true;
    var active = document.activeElement;
    if (active && active.matches('input, textarea, select, [contenteditable="true"]')) return true;
    var fields = document.querySelectorAll('input, textarea, [contenteditable="true"]');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field.tagName === 'INPUT' && /^(checkbox|radio|range|button|submit|hidden)$/i.test(field.type)) continue;
      if (field.value || (field.isContentEditable && field.textContent)) return true;
    }
    return false;
  }
  window.__VYBE_HAS_BOOT_DRAFT__ = hasBootDraft;

  var ENTRY_MIGRATE_KEY = 'vybe.boot.entry-migrate';
  var ENTRY_MIGRATE_ATTEMPTS_KEY = 'vybe.boot.entry-migrate-attempts';
  function checkBootEntry() {
    if (navigator.onLine === false) return;
    var moduleScript = document.querySelector('script[type="module"][src*="/assets/app-"]');
    if (!moduleScript || typeof fetch !== 'function') return;
    var local;
    try { local = new URL(moduleScript.getAttribute('src'), location.origin); } catch (e) { return; }
    if (local.origin !== location.origin) return;
    var controller = new AbortController();
    var deadline = setTimeout(function () { controller.abort(); }, 8000);
    fetch('/version.json?_=' + Date.now(), { cache: 'no-store', signal: controller.signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !/^\/assets\/app-[\w-]+\.js$/.test(v.entry || '')) return;
        if (v.entry === local.pathname) {
          try {
            sessionStorage.removeItem(ENTRY_MIGRATE_KEY);
            sessionStorage.removeItem(ENTRY_MIGRATE_ATTEMPTS_KEY);
          } catch (e) { /* optional metadata */ }
          return;
        }
        if (hasBootDraft() || navigator.onLine === false) return;
        // A durable attempt marker is required before any automatic restart.
        try {
          var target = sessionStorage.getItem(ENTRY_MIGRATE_KEY);
          var attempts = target === v.entry ? parseInt(sessionStorage.getItem(ENTRY_MIGRATE_ATTEMPTS_KEY) || '0', 10) || 0 : 0;
          if (attempts >= 2) return;
          sessionStorage.setItem(ENTRY_MIGRATE_ATTEMPTS_KEY, String(attempts + 1));
          sessionStorage.setItem(ENTRY_MIGRATE_KEY, v.entry);
        } catch (e) { return; }
        return clearOwnedBootFiles().then(function () {
          if (!hasBootDraft() && navigator.onLine !== false) location.replace('/?_vybe_entry=' + Date.now());
        });
      })
      .catch(function () { /* normal app update checks retry after reconnect */ })
      .finally(function () { clearTimeout(deadline); });
  }
  // The watchdog can precede the module tag in the HTML document.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkBootEntry, { once: true });
  } else {
    checkBootEntry();
  }

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
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
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
    clearOwnedBootFiles().then(reload, reload);
  }

  function showRecoveryUi(reason) {
    clearStuckUiState();
    recoveryShown = true;
    var el = document.getElementById(RECOVERY_ID);
    if (!el) return;
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('role', 'alert');
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
      if (onLocalhost && isNativeWrapper) {
        detail.textContent =
          'Offline pack is missing or stale (app shell). Tap Clear cache & reload. If it repeats, set Despia App Start URL to https://vybehub.app and rebuild.';
        // One-shot escape: broken localhost packs cannot self-heal without a fresh OTA.
        try {
          if (sessionStorage.getItem('vybe_localhost_pack_escape') !== '1') {
            sessionStorage.setItem('vybe_localhost_pack_escape', '1');
            detail.textContent = 'Updating from vybehub.app…';
            setTimeout(function () {
              try {
                location.replace('https://vybehub.app/?vybe_pack_escape=' + Date.now());
              } catch (eEsc) {
                /* fall through to buttons */
              }
            }, 500);
          }
        } catch (eSs) { /* ignore */ }
      } else if (onLocalhost) {
        detail.textContent =
          'Offline cache is missing the app shell (often /assets/app.js). Publish a fresh despia/local.json that includes app.js, then Clear cache & reload.';
      } else {
        detail.textContent = 'A script failed to load. Clear cache and reload to get the latest build.';
      }
    } else {
      detail.textContent = 'Something blocked startup. Clear cache and reload.';
    }
  }

  function showRecovery(reason, manual) {
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
    showRecoveryUi(reason);
  }

  function isRecoveryVisible() {
    var el = document.getElementById(RECOVERY_ID);
    return !!(el && el.style.display === 'flex');
  }

  function isSplashVisible() {
    // Native handoff is an invisible #09090b hold (Despia/Android). Never treat
    // body.splash-visible alone as healthy content — that left Fold/Android stuck
    // on a black page forever because startup_timeout never fired.
    var handoff =
      document.documentElement.getAttribute('data-vybe-splash') === 'native-handoff';
    if (handoff) {
      return false;
    }
    if (document.body.classList.contains('splash-visible')) {
      var boot = document.getElementById('vybe-static-boot');
      if (boot) return true;
    }
    var root = document.getElementById('root');
    if (!root) return false;
    var text = root.textContent || '';
    return /VYBE/i.test(text) && /Waking up|Checking session|Loading|Ready|Let's go|Tip/i.test(text);
  }

  function rootHasPaintedUi() {
    var root = document.getElementById('root');
    if (!root) return false;
    if (root.childElementCount > 0) return true;
    return (root.textContent || '').replace(/\s+/g, '').length > 8;
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

  function shouldForceStartupRecovery() {
    if (isAppReady()) return false;
    if (hasMeaningfulContent()) return false;
    // Native handoff + splash-visible with no React paint = stuck black page.
    var handoff =
      document.documentElement.getAttribute('data-vybe-splash') === 'native-handoff';
    if (handoff && !rootHasPaintedUi()) return true;
    if (!isSplashVisible() && !isBundleStillLoading()) return true;
    // Main never evaluated after timeout (Android Despia module-eval stalls).
    if (isNativeWrapper && !(window).__VYBE_MAIN_EVAL__ && !rootHasPaintedUi()) return true;
    return false;
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
            showRecovery('chunk_error');
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
    if (shouldForceStartupRecovery()) {
      showRecovery('startup_timeout');
    }
  }, STARTUP_TIMEOUT_MS);

  // Earlier fail-open on native wrappers: black handoff must not sit forever
  // waiting for the full 35s if the module never evaluates.
  if (isNativeWrapper) {
    setTimeout(function () {
      if (isAppReady() || recoveryShown) return;
      if (!(window).__VYBE_MAIN_EVAL__ && !rootHasPaintedUi()) {
        showRecovery('startup_timeout');
      }
    }, 12000);
  }

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
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var reloadBtn = document.getElementById('vybe-boot-reload');
    var clearBtn = document.getElementById('vybe-boot-clear-cache');
    var prodBtn = document.getElementById('vybe-boot-open-prod');
    if (reloadBtn) reloadBtn.addEventListener('click', function () { window.location.reload(); });
    if (clearBtn) clearBtn.addEventListener('click', function () { window.__VYBE_CLEAR_CACHE_RELOAD__(); });
    if (prodBtn) {
      prodBtn.addEventListener('click', function () {
        try {
          location.replace('https://vybehub.app/?vybe_pack_escape=' + Date.now());
        } catch (e) {
          location.href = 'https://vybehub.app/';
        }
      });
    }
  });
})();
