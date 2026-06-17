#!/usr/bin/env node
/** Verify dist ships stable /assets/app.js and index.html references it. */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = join(root, 'dist', 'index.html');
const appJs = join(root, 'dist', 'assets', 'app.js');

let ok = true;
if (!existsSync(appJs)) {
  console.error('FAIL verify-dist-entry: dist/assets/app.js missing');
  ok = false;
} else {
  console.log('PASS verify-dist-entry: dist/assets/app.js exists');
}

if (!existsSync(distIndex)) {
  console.error('FAIL verify-dist-entry: dist/index.html missing');
  ok = false;
} else {
  const html = readFileSync(distIndex, 'utf8');
  if (!html.includes('/assets/app.js')) {
    console.error('FAIL verify-dist-entry: dist/index.html does not reference /assets/app.js');
    ok = false;
  } else {
    console.log('PASS verify-dist-entry: index.html references /assets/app.js');
  }
}

process.exit(ok ? 0 : 1);
