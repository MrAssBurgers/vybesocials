import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { clientSourceIdentity } from './build-source-identity.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vybe-source-identity-'));
  t.after(() => {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe fixture cleanup path');
    rmSync(root, { recursive: true, force: true });
  });
  for (const dir of ['src', 'public/despia', 'scripts', 'dist/assets']) mkdirSync(join(root, dir), { recursive: true });
  for (const [name, content] of Object.entries({ 'package.json': '{"type":"module","version":"1.0.0"}', 'index.html': '<html></html>\n', 'vite.config.ts': 'export default {};\n', 'src/main.ts': 'export const ready = true;\n' })) writeFileSync(join(root, name), content);
  return root;
}

test('source archives and checkouts have stable identity across newlines and generated metadata', t => {
  const root = fixture(t), before = clientSourceIdentity(root);
  writeFileSync(join(root, 'src/main.ts'), 'export const ready = true;\r\n');
  writeFileSync(join(root, 'public/version.json'), '{"commit":"stale"}');
  writeFileSync(join(root, 'public/boot-theme.js'), 'generated output');
  writeFileSync(join(root, 'public/despia/local.json'), 'different timestamp');
  writeFileSync(join(root, '.env'), 'SECRET=do-not-publish');
  writeFileSync(join(root, 'src/private.local'), 'local-only');
  assert.deepEqual(clientSourceIdentity(root), before);
});
test('changing runtime source, build configuration or binary assets changes identity', t => {
  const root = fixture(t); let previous = clientSourceIdentity(root).source_sha256;
  for (const [name, value] of [['src/main.ts', 'export const ready = false;'], ['vite.config.ts', 'export default {base:"/new/"};'], ['bun.lock', 'changed dependency resolution'], ['public/media.png', Buffer.from([0, 255, 10, 13])]]) {
    writeFileSync(join(root, name), value); const next = clientSourceIdentity(root).source_sha256;
    assert.notEqual(next, previous); previous = next;
  }
});
test('includes public native-link configuration while excluding hidden local environment files', t => {
  const root = fixture(t), before = clientSourceIdentity(root);
  mkdirSync(join(root, 'public/.well-known')); writeFileSync(join(root, 'public/.well-known/assetlinks.json'), '[]');
  assert.notEqual(clientSourceIdentity(root).source_sha256, before.source_sha256);
  const native = clientSourceIdentity(root); writeFileSync(join(root, 'public/.env'), 'SECRET=private');
  assert.deepEqual(clientSourceIdentity(root), native);
  writeFileSync(join(root, 'public/_headers'), '/*\n  Cache-Control: no-cache\n');
  writeFileSync(join(root, 'public/.well-known/apple-app-site-association'), '{\n"applinks":{}\n}');
  const lf = clientSourceIdentity(root);
  writeFileSync(join(root, 'public/_headers'), '/*\r\n  Cache-Control: no-cache\r\n');
  writeFileSync(join(root, 'public/.well-known/apple-app-site-association'), '{\r\n"applinks":{}\r\n}');
  assert.deepEqual(clientSourceIdentity(root), lf);
});
test('the real version writer records archive source identity and keeps an absent commit unknown', t => {
  const root = fixture(t);
  for (const name of ['write-version-json.mjs', 'build-source-identity.mjs']) cpSync(new URL(name, import.meta.url), join(root, 'scripts', name));
  writeFileSync(join(root, 'dist/assets/app-fixture.js'), 'export const fixture=true;');
  const run = spawnSync(process.execPath, ['scripts/write-version-json.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const version = JSON.parse(readFileSync(join(root, 'dist/version.json'), 'utf8'));
  assert.equal(version.commit, 'unknown'); assert.equal(version.source_schema, 'vybe-client-source-v1');
  assert.equal(version.source_sha256, clientSourceIdentity(root).source_sha256);
  assert.equal(version.entry, '/assets/app-fixture.js'); assert.match(version.entry_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'public/version.json'), 'utf8')), version);
});
test('a missing required root input fails instead of certifying an incomplete archive', t => {
  const root = fixture(t);
  rmSync(join(root, 'index.html'));
  assert.throws(() => clientSourceIdentity(root), /Missing client source input/);
});
