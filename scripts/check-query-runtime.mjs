import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const queryPackages = ['@tanstack/react-query', '@tanstack/query-core', '@tanstack/react-query-persist-client', '@tanstack/query-persist-client-core', '@tanstack/query-async-storage-persister'];
/** Production and local tests must exercise the same mutation and persistence APIs. */
export function checkQueryRuntime(root) {
  const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const pkg = read('package.json'), npm = read('package-lock.json');
  const parsed = ts.parseConfigFileTextToJson('bun.lock', readFileSync(join(root, 'bun.lock'), 'utf8'));
  if (parsed.error || !parsed.config?.packages) throw new Error('Cannot validate bun.lock query runtime');
  const bun = parsed.config, runtime = {};
  for (const name of queryPackages) {
    const locked = npm.packages[`node_modules/${name}`];
    if (!locked || !/^5\.\d+\.\d+$/.test(locked.version)) throw new Error(`Missing npm query runtime: ${name}`);
    const expected = `${name}@${locked.version}`;
    const entries = Object.entries(bun.packages).filter(([key]) => key === name || key.endsWith(`/${name}`));
    if (!entries.length || entries.some(([, row]) => row[0] !== expected)) throw new Error(`Query runtime differs between npm and Bun for ${name}: expected ${locked.version}`);
    const installed = read(`node_modules/${name}/package.json`).version;
    if (installed !== locked.version) throw new Error(`Installed query runtime differs for ${name}: expected ${locked.version}, got ${installed}`);
    if (pkg.dependencies[name] && (pkg.dependencies[name] !== locked.version || npm.packages[''].dependencies[name] !== locked.version || bun.workspaces[''].dependencies[name] !== locked.version)) throw new Error(`Pin the tested query runtime for ${name} in both lockfiles`);
    runtime[name] = installed;
  }
  if (new Set(Object.values(runtime)).size !== 1) throw new Error('Query runtime and persistence packages must use one tested version');
  return runtime;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  console.log('[query-runtime]', JSON.stringify(checkQueryRuntime(root)));
}
