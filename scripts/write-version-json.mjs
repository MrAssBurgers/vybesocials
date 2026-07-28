#!/usr/bin/env node
/**
 * Emit /version.json with commit SHA and hashed app entry for deploy verification.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

let commit = 'unknown';
try {
  commit = execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  /* non-git tree */
}

const assetsDir = join(root, 'dist', 'assets');
let entry = null;
let entrySha256 = null;
if (existsSync(assetsDir)) {
  entry = readdirSync(assetsDir).find((name) => /^app-[A-Za-z0-9_-]+\.js$/.test(name)) ?? null;
  if (entry) {
    const buf = readFileSync(join(assetsDir, entry));
    entrySha256 = createHash('sha256').update(buf).digest('hex');
  }
}

const version = {
  app_version: pkg.version || '0.0.0',
  commit,
  commit_short: commit.slice(0, 7),
  built_at: new Date().toISOString(),
  entry: entry ? `/assets/${entry}` : null,
  entry_sha256: entrySha256,
};

const distPath = join(root, 'dist', 'version.json');
const publicDir = join(root, 'public');
const publicPath = join(publicDir, 'version.json');

writeFileSync(distPath, `${JSON.stringify(version, null, 2)}\n`);
mkdirSync(publicDir, { recursive: true });
writeFileSync(publicPath, `${JSON.stringify(version, null, 2)}\n`);
console.log(`[write-version-json] ${version.entry || 'no entry'} @ ${version.commit_short}`);
