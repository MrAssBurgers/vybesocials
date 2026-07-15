#!/usr/bin/env node
/**
 * Despia Offline → Native requires critical shell files in despia/local.json.
 * A stale manifest that lists hashed index-*.js but not /assets/app.js bricks iOS
 * with "A script failed to load" once the WebView serves from localhost.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'dist', 'despia', 'local.json');

if (!existsSync(manifestPath)) {
  console.log('SKIP verify-despia-local: no dist/despia/local.json (PWA mode)');
  process.exit(0);
}

const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
const assets = Array.isArray(raw.assets) ? raw.assets : [];
const required = ['/index.html', '/assets/app.js', '/boot-guard.js', '/boot-theme.js'];
let ok = true;

for (const path of required) {
  if (!assets.includes(path)) {
    console.error(`FAIL verify-despia-local: missing ${path} in despia/local.json`);
    ok = false;
  } else {
    console.log(`PASS verify-despia-local: ${path}`);
  }
}

if (!raw.deployed_at) {
  console.error('FAIL verify-despia-local: missing deployed_at');
  ok = false;
}

process.exit(ok ? 0 : 1);
