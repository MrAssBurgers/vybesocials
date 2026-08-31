#!/usr/bin/env node
/**
 * Apply VYBE guest explore/clips fixes from VYBE-guest-explore-clips.patch.
 * Runs a conflict check first and exits without modifying files when the patch
 * does not apply cleanly against the current tree.
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PATCH_FILE = path.join(ROOT, 'VYBE-guest-explore-clips.patch');

function fail(message, code = 1) {
  console.error(`\napply-vybe-fixes: ${message}`);
  process.exit(code);
}

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0 && !allowFailure) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(output || `git ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result;
}

if (!fs.existsSync(PATCH_FILE)) {
  fail(`missing patch file: ${path.basename(PATCH_FILE)}`);
}

const patchStat = fs.statSync(PATCH_FILE);
if (!patchStat.isFile() || patchStat.size === 0) {
  fail(`${path.basename(PATCH_FILE)} is empty or unreadable`);
}

console.log('apply-vybe-fixes: checking patch for conflicts…');
const check = runGit(['apply', '--check', '--verbose', PATCH_FILE], { allowFailure: true });

if (check.status !== 0) {
  console.error('\napply-vybe-fixes: patch did not apply cleanly. No files were changed.');
  console.error(check.stderr || check.stdout || 'git apply --check failed.');
  process.exit(2);
}

console.log('apply-vybe-fixes: no conflicts detected, applying patch…');
runGit(['apply', '--verbose', PATCH_FILE]);

const changed = execFileSync('git', ['diff', '--name-only'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

console.log(`apply-vybe-fixes: applied successfully (${changed.length} file(s) changed).`);
for (const file of changed) {
  console.log(`  - ${file}`);
}
