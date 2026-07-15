#!/usr/bin/env node
/**
 * Post-build offline hook.
 * Default: generate despia/local.json for Despia Offline Support → Native.
 * Set VITE_OFFLINE_MODE=pwa to skip the manifest (service worker only).
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
const useDespiaLocal = mode !== 'pwa';

if (useDespiaLocal) {
  console.log('[postbuild] Offline mode "despia-local" — generating despia/local.json');
  const result = spawnSync('npx', ['despia-local', 'dist'], {
    stdio: 'inherit',
    shell: true,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
} else {
  console.log(`[postbuild] Offline mode "${mode}" — PWA service worker only (no despia/local.json)`);
}

const inline = spawnSync('node', ['scripts/inline-boot-guard.mjs'], { stdio: 'inherit' });
if ((inline.status ?? 1) !== 0) process.exit(inline.status ?? 1);

const verify = spawnSync('node', ['scripts/verify-dist-entry.mjs'], { stdio: 'inherit' });
process.exit(verify.status ?? 1);
