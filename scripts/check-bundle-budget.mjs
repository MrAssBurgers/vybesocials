#!/usr/bin/env node

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = join(process.cwd(), 'dist', 'assets');
const entries = readdirSync(assetsDir).filter((name) => /^app-[A-Za-z0-9_-]+\.js$/.test(name));

if (entries.length !== 1) {
  console.error(`[bundle-budget] Expected one hashed app entry, found ${entries.length}`);
  process.exit(1);
}

const bytes = readFileSync(join(assetsDir, entries[0]));
const rawKb = bytes.byteLength / 1024;
const gzipKb = gzipSync(bytes, { level: 9 }).byteLength / 1024;
const maxRawKb = Number(process.env.VYBE_MAX_APP_RAW_KB || 1125);
const maxGzipKb = Number(process.env.VYBE_MAX_APP_GZIP_KB || 335);

console.log(
  `[bundle-budget] ${entries[0]}: ${rawKb.toFixed(1)} KB raw / ${gzipKb.toFixed(1)} KB gzip ` +
  `(limits ${maxRawKb} / ${maxGzipKb} KB)`,
);

if (rawKb > maxRawKb || gzipKb > maxGzipKb) {
  console.error('[bundle-budget] Initial app bundle exceeds the release budget; lazy-load non-critical code.');
  process.exit(1);
}
