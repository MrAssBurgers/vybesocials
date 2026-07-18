#!/usr/bin/env node
/**
 * Stamp dist/index.html with deployed_at + Despia stale-pack escape hatch.
 * When the native offline pack finally updates, this detects a newer remote
 * manifest and jumps once to https://vybehub.app so the WebView is not stuck
 * on a half-applied localhost cache.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = join(root, 'dist', 'index.html');
const localJson = join(root, 'dist', 'despia', 'local.json');

if (!existsSync(distIndex) || !existsSync(localJson)) {
  console.warn('[stamp-despia-ota] missing dist index or local.json — skip');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(localJson, 'utf8'));
const deployedAt = String(manifest.deployed_at || Date.now());
const hashedEntry =
  (manifest.assets || []).find((a) => /^\/assets\/app-[A-Za-z0-9_-]+\.js$/.test(a)) ||
  '/assets/app.js';

const escapeScript = `
<script data-vybe-ota-escape="1">
(function () {
  var BUILD = ${JSON.stringify(deployedAt)};
  var ENTRY = ${JSON.stringify(hashedEntry)};
  var PROD = 'https://vybehub.app';
  try {
    document.documentElement.setAttribute('data-vybe-deployed-at', BUILD);
    document.documentElement.setAttribute('data-vybe-entry', ENTRY);
    var buildEl = document.getElementById('vybe-splash-build');
    if (buildEl) buildEl.textContent = 'build ' + String(BUILD).slice(-6);
  } catch (e0) {}

  function isAppReady() {
    return (
      window.__VYBE_MAIN_EVAL__ === true ||
      document.documentElement.getAttribute('data-vybe-app-ready') === 'true'
    );
  }

  function hideStaticSplash() {
    try {
      var boot = document.getElementById('vybe-static-boot');
      if (!boot) return;
      boot.classList.add('vybe-static-boot-fade');
      boot.style.opacity = '0';
      boot.style.pointerEvents = 'none';
      boot.style.visibility = 'hidden';
      document.body.classList.remove('splash-visible');
    } catch (eHide) {}
  }

  function hardReloadOnce(reason) {
    try {
      if (sessionStorage.getItem('vybe_boot_reload') === '1') return false;
      sessionStorage.setItem('vybe_boot_reload', '1');
    } catch (eSs) {
      if (window.__VYBE_BOOT_RELOAD__) return false;
      window.__VYBE_BOOT_RELOAD__ = true;
    }
    try {
      var url = new URL(location.href);
      url.searchParams.set('vybe_boot', String(Date.now()));
      location.replace(url.toString());
    } catch (eRel) {
      location.reload();
    }
    return true;
  }

  function loadStableAppJs(reason) {
    if (window.__VYBE_MAIN_EVAL__ === true) return;
    if (window.__VYBE_STABLE_RELOAD__) {
      // Already injected once — if still not evaluating, hard reload once.
      setTimeout(function () {
        if (!isAppReady()) hardReloadOnce(reason + '_after_inject');
      }, 2000);
      return;
    }
    window.__VYBE_STABLE_RELOAD__ = true;
    hideStaticSplash();
    var s = document.createElement('script');
    s.type = 'module';
    s.crossOrigin = 'anonymous';
    s.src = '/assets/app.js?vybe_recovery=' + Date.now();
    s.setAttribute('data-vybe-stable-recovery', '1');
    s.onload = function () {
      window.__VYBE_APP_LOADED__ = true;
      setTimeout(function () {
        if (!isAppReady()) hardReloadOnce(reason + '_onload_no_eval');
      }, 2000);
    };
    s.onerror = function () {
      hardReloadOnce(reason + '_inject_error');
    };
    document.head.appendChild(s);
  }

  function probeReady(label) {
    if (isDespia && !isAppReady() && (label === '3s' || label === '8s')) {
      loadStableAppJs('despia_no_main_eval_' + label);
    }
  }

  var host = '';
  try { host = location.hostname || ''; } catch (e2) { host = ''; }
  var ua = (navigator.userAgent || '').toLowerCase();
  // Avoid regex here — template-literal escaping previously produced an invalid
  // /; wv)/ pattern that threw SyntaxError and aborted stall recovery on Android.
  var isDespia =
    ua.indexOf('despia') !== -1 ||
    ua.indexOf('vybeapp') !== -1 ||
    ua.indexOf('; wv') !== -1 ||
    ua.indexOf(' wv') !== -1 ||
    !!(window).Despia ||
    !!(window).__DESPIA__;
  var onLocal = host === 'localhost' || host === '127.0.0.1';

  // Page-level timers — do not rely only on hashed script.onload (flaky on Android WV).
  setTimeout(function () { probeReady('3s'); }, 3000);
  setTimeout(function () { probeReady('5s'); }, 5000);
  setTimeout(function () { probeReady('8s'); }, 8000);
  setTimeout(function () { probeReady('12s'); }, 12000);

  // Also watch the primary module entry for load/error recovery.
  try {
    var mods = document.querySelectorAll('script[type="module"][src*="/assets/app"]');
    for (var i = 0; i < mods.length; i++) {
      (function (el) {
        el.addEventListener('error', function () {
          if (isDespia) loadStableAppJs('module_script_error');
        });
      })(mods[i]);
    }
  } catch (eMod) {}

  // Do NOT redirect localhost → vybehub.app: that swaps origins and drops the
  // Firebase session (storage is origin-scoped). Instead, tip the native OTA
  // hydrator with a cache-busted manifest fetch; if prod is newer than this
  // pack, reload once after a beat so a mid-session hydrate can apply.
  if (!isDespia || !onLocal) return;
  fetch(PROD + '/despia/local.json?vybe_ota=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var remote = String((j && j.deployed_at) || '');
      if (!remote || remote === BUILD) return;
      try {
        if (sessionStorage.getItem('vybe_ota_seen') === remote) return;
        sessionStorage.setItem('vybe_ota_seen', remote);
      } catch (eSeen) {}
      setTimeout(function () {
        if (!isAppReady()) return;
        hardReloadOnce('ota_remote_newer_' + remote.slice(-6));
      }, 1800);
    })
    .catch(function () {});
})();
</script>`;

let html = readFileSync(distIndex, 'utf8');
html = html.replace(/<script data-vybe-ota-escape="1">[\s\S]*?<\/script>\s*/g, '');
if (html.includes('<div id="root"></div>')) {
  html = html.replace('<div id="root"></div>', `<div id="root"></div>\n${escapeScript}`);
} else {
  html = html.replace('</body>', `${escapeScript}\n</body>`);
}
writeFileSync(distIndex, html);
console.log(`[stamp-despia-ota] stamped deployed_at=${deployedAt} entry=${hashedEntry}`);
