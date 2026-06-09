#!/usr/bin/env node
/**
 * Post-build offline hook.
 * Default (PWA): no despia/local.json — caching is handled by public/sw.js.
 * Set VITE_OFFLINE_MODE=despia-local to generate the Despia local-server manifest.
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
  return 'pwa';
}

const mode = readOfflineMode();

if (mode !== 'despia-local') {
  console.log(`[postbuild] Offline mode "${mode}" — PWA service worker only (no despia/local.json)`);
  process.exit(0);
}

console.log('[postbuild] Offline mode "despia-local" — generating despia/local.json');
const result = spawnSync('npx', ['despia-local', 'dist'], {
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
