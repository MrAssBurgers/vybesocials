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
  } catch (e0) {}

  function beacon(event, payload) {
    try {
      fetch('https://us-central1-vybe-daaab.cloudfunctions.net/authQr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            action: 'debug_oauth',
            event: event,
            hypothesisId: 'H-ota',
            location: 'index.html:ota-escape',
            payload: payload || {},
          },
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e1) {}
  }

  var host = '';
  try { host = location.hostname || ''; } catch (e2) { host = ''; }
  var ua = (navigator.userAgent || '').toLowerCase();
  var isDespia = /despia/.test(ua) || !!(window).Despia || !!(window).__DESPIA__;
  var onLocal = host === 'localhost' || host === '127.0.0.1';

  beacon('boot_fingerprint', {
    build: BUILD,
    entry: ENTRY,
    host: host,
    despia: isDespia,
    local: onLocal,
    href: String(location.href || '').slice(0, 120),
  });

  // Do NOT redirect localhost → vybehub.app: that swaps origins and drops the
  // Firebase session (storage is origin-scoped). Beacon only for OTA debug.
  if (!isDespia || !onLocal) return;
  fetch(PROD + '/despia/local.json?vybe_ota=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (remote) {
      var remoteAt = String((remote && remote.deployed_at) || '');
      beacon('ota_compare', {
        build: BUILD,
        remoteAt: remoteAt,
        entry: ENTRY,
        stale: Boolean(remoteAt && remoteAt !== BUILD),
      });
    })
    .catch(function (err) {
      beacon('ota_compare_failed', { build: BUILD, msg: String(err && err.message || err).slice(0, 80) });
    });
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
