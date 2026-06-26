#!/usr/bin/env node
/**
 * Build synchronous boot-theme.js for index.html (pre-React theme paint).
 */
import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await esbuild.build({
  entryPoints: [path.join(root, 'src/boot-theme-entry.ts')],
  bundle: true,
  format: 'iife',
  outfile: path.join(root, 'public/boot-theme.js'),
  minify: true,
  target: 'es2020',
  logLevel: 'info',
});

console.log('[boot-theme] wrote public/boot-theme.js');
