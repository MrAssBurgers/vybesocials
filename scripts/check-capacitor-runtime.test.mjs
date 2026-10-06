import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { checkCapacitorRuntime, patchedCapacitorVersion as version, capacitorSwiftRevision as revision } from './check-capacitor-runtime.mjs';

const names = ['@capacitor/android', '@capacitor/ios', '@capacitor/core', '@capacitor/cli'];
function fixture(t) {
  const base = resolve(tmpdir()), root = mkdtempSync(join(base, 'vybe-capacitor-check-'));
  const write = (file, data) => { const path = join(root, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data)); };
  const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const dependencies = Object.fromEntries(names.map(name => [name, version]));
  write('package.json', { dependencies });
  write('package-lock.json', { packages: { '': { dependencies }, ...Object.fromEntries(names.map(name => [`node_modules/${name}`, { version }])) } });
  write('bun.lock', { workspaces: { '': { dependencies } }, packages: Object.fromEntries(names.map(name => [name, [`${name}@${version}`, '', {}, 'test-integrity']])) });
  for (const name of names) write(`node_modules/${name}/package.json`, { name, version });
  write('ios/App/CapApp-SPM/Package.swift', `.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "${version}")`);
  write('ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', { pins: [{ identity: 'capacitor-swift-pm', location: 'https://github.com/ionic-team/capacitor-swift-pm.git', state: { version, revision } }] });
  t.after(() => { const child = relative(base, root); assert.ok(child.startsWith('vybe-capacitor-check-') && !child.includes('..')); rmSync(root, { recursive: true }); });
  return { root, read, write };
}
test('accepts coordinated patched npm, Bun, installed runtime and native tag records', t => {
  const f = fixture(t); assert.equal(Object.keys(checkCapacitorRuntime(f.root, true)).length, 4);
});
test('rejects an affected native package even when all package sources agree', t => {
  const f = fixture(t), pkg = f.read('package.json'); pkg.dependencies['@capacitor/android'] = '8.4.0'; f.write('package.json', pkg);
  assert.throws(() => checkCapacitorRuntime(f.root), /Pin patched/);
});
test('rejects the old hosted Bun core while local npm is patched', t => {
  const f = fixture(t), bun = f.read('bun.lock'); bun.packages['@capacitor/core'][0] = '@capacitor/core@8.0.1'; f.write('bun.lock', bun);
  assert.throws(() => checkCapacitorRuntime(f.root), /Bun Capacitor runtime differs/);
});
test('rejects a nested affected npm runtime', t => {
  const f = fixture(t), npm = f.read('package-lock.json'); npm.packages['node_modules/plugin/node_modules/@capacitor/core'] = { version: '8.4.0' }; f.write('package-lock.json', npm);
  assert.throws(() => checkCapacitorRuntime(f.root), /Nested npm/);
});
test('rejects a stale installed package after a lock-only update', t => {
  const f = fixture(t); f.write('node_modules/@capacitor/ios/package.json', { version: '8.4.0' });
  assert.throws(() => checkCapacitorRuntime(f.root), /Installed\/npm/);
});
test('native check rejects a stale iOS manifest even when web package checks pass', t => {
  const f = fixture(t); f.write('ios/App/CapApp-SPM/Package.swift', '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.0")');
  checkCapacitorRuntime(f.root); assert.throws(() => checkCapacitorRuntime(f.root, true), /iOS manifest/);
});
test('native check rejects a guessed revision rather than accepting just a patched version label', t => {
  const f = fixture(t), file = 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', resolved = f.read(file);
  resolved.pins[0].state.revision = '44ae2505f54a80c5e559533950886d0644fc2fca'; f.write(file, resolved);
  assert.throws(() => checkCapacitorRuntime(f.root, true), /iOS Capacitor pin/);
});
