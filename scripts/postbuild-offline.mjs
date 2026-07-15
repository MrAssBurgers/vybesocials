#!/usr/bin/env node
/**
 * Post-build offline hook.
 * Always regenerate despia/local.json — Despia Offline → Native compares
 * deployed_at and will NOT re-hydrate if the file is stale/missing from a
 * Lovable Publish that skipped the plugin (e.g. VITE_OFFLINE_MODE=pwa).
 */

import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

const result = spawnSync('npx', ['despia-local', 'dist'], {
  stdio: 'inherit',
  shell: true,
});
if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
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

const verify = spawnSync('node', ['scripts/verify-dist-entry.mjs'], { stdio: 'inherit' });
if ((verify.status ?? 1) !== 0) process.exit(verify.status ?? 1);

const localCheck = spawnSync('node', ['scripts/verify-despia-local.mjs'], { stdio: 'inherit' });
process.exit(localCheck.status ?? 1);
