#!/usr/bin/env node
/**
 * Post-build offline hook.
 * Always regenerate despia/local.json — Despia Offline → Native compares
 * deployed_at and will NOT re-hydrate if the file is stale/missing from a
 * Lovable Publish that skipped the plugin (e.g. VITE_OFFLINE_MODE=pwa).
 */

import { readFileSync, existsSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateManifest } from '@despia/local';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readOfflineMode() {
  if (process.env.VITE_OFFLINE_MODE) {
    return process.env.VITE_OFFLINE_MODE.trim();
  }
  if (existsSync('.env')) {
    const match = readFileSync('.env', 'utf8').match(/^VITE_OFFLINE_MODE=(.+)$/m);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return 'despia-local';
}

const mode = readOfflineMode();
console.log(`[postbuild] Offline mode "${mode}" — always generating despia/local.json for Native`);

// Vite's primary entry is content-hashed so Despia OTA sees a new path on every
// publish. Keep /assets/app.js as a stable recovery alias for old cached shells
// and the inline boot fallback.
try {
  const assetsDir = join(root, 'dist', 'assets');
  const entry = readdirSync(assetsDir).find((name) => /^app-[A-Za-z0-9_-]+\.js$/.test(name));
  if (!entry) throw new Error('hashed app entry not found');
  copyFileSync(join(assetsDir, entry), join(assetsDir, 'app.js'));
  console.log(`[postbuild] Stable recovery alias: /assets/app.js → /assets/${entry}`);
} catch (err) {
  console.error('[postbuild] Could not create stable app.js alias:', err);
  process.exit(1);
}

try {
  const manifest = generateManifest({ outputDir: 'dist', entryHtml: 'index.html' });
  console.log(`[postbuild] Generated despia/local.json with ${manifest.assets.length} assets`);
} catch (err) {
  console.error('[postbuild] Could not generate despia/local.json:', err);
  process.exit(1);
}

// Keep a copy under public/ so even odd builders that skip dist post-steps
// still ship a manifest on the next Vite copy (deployed_at updates each build).
try {
  const from = join(root, 'dist', 'despia', 'local.json');
  const toDir = join(root, 'public', 'despia');
  const to = join(toDir, 'local.json');
  mkdirSync(toDir, { recursive: true });
  copyFileSync(from, to);
  console.log('[postbuild] Synced public/despia/local.json');
} catch (err) {
  console.warn('[postbuild] Could not sync public/despia/local.json:', err);
}

const inline = spawnSync('node', ['scripts/inline-boot-guard.mjs'], { stdio: 'inherit' });
if ((inline.status ?? 1) !== 0) process.exit(inline.status ?? 1);

const stamp = spawnSync('node', ['scripts/stamp-despia-ota.mjs'], { stdio: 'inherit' });
if ((stamp.status ?? 1) !== 0) process.exit(stamp.status ?? 1);

const verify = spawnSync('node', ['scripts/verify-dist-entry.mjs'], { stdio: 'inherit' });
if ((verify.status ?? 1) !== 0) process.exit(verify.status ?? 1);

const localCheck = spawnSync('node', ['scripts/verify-despia-local.mjs'], { stdio: 'inherit' });
process.exit(localCheck.status ?? 1);
