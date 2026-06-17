#!/usr/bin/env node
/**
 * Inlines public/boot-guard.js into dist/index.html so production never 404s the watchdog.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distIndex = join(root, 'dist', 'index.html');
const guardSrc = join(root, 'public', 'boot-guard.js');

if (!existsSync(distIndex)) {
  console.warn('[inline-boot-guard] dist/index.html missing — skip');
  process.exit(0);
}

const guard = readFileSync(guardSrc, 'utf8')
  .replace(/^\/\*[\s\S]*?\*\/\s*/m, '')
  .trim();

let html = readFileSync(distIndex, 'utf8');

const externalTag = '<script src="/boot-guard.js"></script>';
const fallbackBlock = /<script>\s*\(function \(\) \{\s*if \(window\.__VYBE_MARK_BOOT_COMPLETE__\)[\s\S]*?<\/script>\s*/;

html = html.replace(fallbackBlock, '');
html = html.replace(
  externalTag,
  `<script>\n${guard}\n</script>`,
);

if (!html.includes('__VYBE_MARK_BOOT_COMPLETE__')) {
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"></div>\n    <script>\n${guard}\n</script>`,
  );
}

writeFileSync(distIndex, html);
console.log('[inline-boot-guard] Inlined boot guard into dist/index.html');
