#!/usr/bin/env node
/**
 * Remove dormant maintenance/recovery copy from the normal deployed DOM.
 *
 * The source index keeps human-readable fallback markup for local development,
 * but production HTML must not expose "Under reconstruction" or startup-error
 * headings to crawlers, accessibility tools, or stale WebViews while the app is
 * healthy. Emergency maintenance and boot recovery remain available through
 * tiny inline bootstraps that create/fill their UI only when activated.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = join(root, 'dist', 'index.html');

if (!existsSync(distIndex)) {
  console.error('[sanitize-shell] dist/index.html not found');
  process.exit(1);
}

const maintenanceBootstrap = String.raw`
    <script data-vybe-maintenance-bootstrap="1">
      (function () {
        if (document.documentElement.getAttribute('data-vybe-maintenance') !== 'true') return;
        window.__VYBE_MAINTENANCE__ = true;

        var style = document.createElement('style');
        style.setAttribute('data-vybe-maintenance-style', '1');
        style.textContent =
          '#vybe-maintenance-static{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:1.5rem;text-align:center;background:#07070c;color:#fafafa;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
          '#vybe-maintenance-static .vybe-maint-inner{max-width:28rem}' +
          '#vybe-maintenance-static .vybe-maint-badge{display:inline-block;margin:0 0 1rem;padding:.35rem .9rem;border-radius:9999px;border:1px solid rgba(139,92,246,.35);background:rgba(139,92,246,.12);color:#ddd6fe;font-size:.875rem;font-weight:500}' +
          '#vybe-maintenance-static .vybe-maint-title{margin:0 0 .75rem;font-size:1.75rem;font-weight:700;letter-spacing:-.02em}' +
          '#vybe-maintenance-static .vybe-maint-body{margin:0;font-size:1.05rem;line-height:1.6;color:#d4d4d8}' +
          '#vybe-maintenance-static .vybe-maint-foot{margin:1.5rem 0 0;font-size:.75rem;color:#71717a}';
        document.head.appendChild(style);

        var shell = document.createElement('div');
        shell.id = 'vybe-maintenance-static';
        shell.setAttribute('role', 'alert');
        shell.setAttribute('aria-live', 'polite');
        shell.innerHTML =
          '<div class="vybe-maint-inner">' +
            '<p class="vybe-maint-badge">Maintenance</p>' +
            '<div class="vybe-maint-title" role="heading" aria-level="1">VYBE is temporarily unavailable</div>' +
            '<p class="vybe-maint-body">We are completing maintenance. Please check back soon.</p>' +
            '<p class="vybe-maint-foot">vybehub.app</p>' +
          '</div>';
        document.body.appendChild(shell);
      })();
    </script>`;

const recoveryShell = String.raw`
    <div id="vybe-boot-recovery" aria-hidden="true" style="display:none;position:fixed;inset:0;z-index:2147483647;align-items:center;justify-content:center;padding:1.5rem;text-align:center;background:#07070c;color:#fafafa;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:22rem;">
        <p data-vybe-recovery-badge style="display:inline-block;margin:0 0 1rem;padding:0.35rem 0.9rem;border-radius:9999px;border:1px solid rgba(139,92,246,0.35);background:rgba(139,92,246,0.12);color:#ddd6fe;font-size:0.875rem;font-weight:500;"></p>
        <div data-vybe-recovery-title role="heading" aria-level="1" style="margin:0 0 0.75rem;font-size:1.5rem;font-weight:700;"></div>
        <p id="vybe-boot-recovery-detail" style="margin:0 0 1.25rem;font-size:0.95rem;line-height:1.55;color:#d4d4d8;"></p>
        <div style="display:flex;flex-direction:column;gap:0.65rem;">
          <button id="vybe-boot-reload" type="button" aria-label="Reload VYBE" style="border:0;border-radius:9999px;padding:0.7rem 1rem;font-size:0.9rem;font-weight:600;background:#8b5cf6;color:#fff;"><span data-vybe-recovery-label="reload"></span></button>
          <button id="vybe-boot-clear-cache" type="button" aria-label="Clear cache and reload VYBE" style="border:1px solid #3f3f46;border-radius:9999px;padding:0.7rem 1rem;font-size:0.9rem;font-weight:600;background:transparent;color:#fafafa;"><span data-vybe-recovery-label="clear"></span></button>
          <button id="vybe-boot-open-prod" type="button" aria-label="Open vybehub.app" style="border:0;border-radius:9999px;padding:0.55rem 1rem;font-size:0.8rem;font-weight:500;background:transparent;color:#a1a1aa;text-decoration:underline;"><span data-vybe-recovery-label="open"></span></button>
        </div>
      </div>
    </div>
    <script data-vybe-recovery-labels="1">
      (function () {
        var shell = document.getElementById('vybe-boot-recovery');
        if (!shell || typeof MutationObserver === 'undefined') return;
        var filled = false;
        function fillWhenVisible() {
          var visible = shell.style.display === 'flex' || shell.getAttribute('aria-hidden') === 'false';
          if (!visible) return;
          if (shell.getAttribute('aria-hidden') !== 'false') shell.setAttribute('aria-hidden', 'false');
          shell.setAttribute('role', 'alert');
          shell.setAttribute('aria-live', 'assertive');
          if (filled) return;
          filled = true;
          var badge = shell.querySelector('[data-vybe-recovery-badge]');
          var title = shell.querySelector('[data-vybe-recovery-title]');
          var reload = shell.querySelector('[data-vybe-recovery-label="reload"]');
          var clear = shell.querySelector('[data-vybe-recovery-label="clear"]');
          var open = shell.querySelector('[data-vybe-recovery-label="open"]');
          if (badge) badge.textContent = 'Startup recovery';
          if (title) title.textContent = "VYBE didn't load";
          if (reload) reload.textContent = 'Reload';
          if (clear) clear.textContent = 'Clear cache & reload';
          if (open) open.textContent = 'Open vybehub.app';
        }
        new MutationObserver(fillWhenVisible).observe(shell, {
          attributes: true,
          attributeFilter: ['style', 'aria-hidden']
        });
        fillWhenVisible();
      })();
    </script>`;

let html = readFileSync(distIndex, 'utf8');

const maintenanceRegion = /\n\s*<div id="vybe-maintenance-static"[\s\S]*?(?=\n\s*<div class="vybe-bg")/;
if (!maintenanceRegion.test(html)) {
  console.error('[sanitize-shell] maintenance fallback region not found');
  process.exit(1);
}
html = html.replace(maintenanceRegion, `\n${maintenanceBootstrap}`);

const recoveryRegion = /\n\s*<div id="vybe-boot-recovery"[\s\S]*?(?=\n\s*<div id="vybe-static-boot")/;
if (!recoveryRegion.test(html)) {
  console.error('[sanitize-shell] boot recovery region not found');
  process.exit(1);
}
html = html.replace(recoveryRegion, `\n${recoveryShell}`);

// Verify human-visible static markup, not strings inside inactive scripts/styles.
const staticMarkup = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

for (const forbidden of [
  'Under reconstruction',
  'We&rsquo;ll be back soon',
  'We’ll be back soon',
  'VYBE is down for reconstruction',
  'VYBE didn&rsquo;t load',
  "VYBE didn't load",
  'Reload or clear cache to continue.',
]) {
  if (staticMarkup.includes(forbidden)) {
    console.error(`[sanitize-shell] dormant fallback copy still present: ${forbidden}`);
    process.exit(1);
  }
}

writeFileSync(distIndex, html);
console.log('[sanitize-shell] PASS: fallback copy is created only when activated');
