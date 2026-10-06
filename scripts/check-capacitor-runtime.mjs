import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const patchedCapacitorVersion = '8.4.3';
export const capacitorSwiftRevision = '89e0d8ec2321025f549ddb19259a717467943b97';
const packages = ['@capacitor/android', '@capacitor/ios', '@capacitor/core', '@capacitor/cli'];

/** Prevent local/native and hosted lockfiles from selecting an affected shell. */
export function checkCapacitorRuntime(root, nativeRecords = false) {
  const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const pkg = read('package.json'), npm = read('package-lock.json');
  const parsed = ts.parseConfigFileTextToJson('bun.lock', readFileSync(join(root, 'bun.lock'), 'utf8'));
  if (parsed.error || !parsed.config?.packages) throw new Error('Cannot validate Bun Capacitor runtime');
  const bun = parsed.config, runtime = {};
  for (const name of packages) {
    const version = patchedCapacitorVersion;
    if (pkg.dependencies[name] !== version || npm.packages[''].dependencies[name] !== version || bun.workspaces[''].dependencies[name] !== version) throw new Error(`Pin patched Capacitor ${name} to ${version} in both lockfiles`);
    if (npm.packages[`node_modules/${name}`]?.version !== version || read(`node_modules/${name}/package.json`).version !== version) throw new Error(`Installed/npm Capacitor runtime differs for ${name}`);
    if (Object.entries(npm.packages).some(([key, row]) => key.endsWith(`/node_modules/${name}`) && row.version !== version)) throw new Error(`Nested npm Capacitor runtime differs for ${name}`);
    const entries = Object.entries(bun.packages).filter(([key]) => key === name || key.endsWith(`/${name}`));
    if (!entries.length || entries.some(([, row]) => row[0] !== `${name}@${version}`)) throw new Error(`Bun Capacitor runtime differs for ${name}`);
    runtime[name] = version;
  }
  if (nativeRecords) {
    const manifest = readFileSync(join(root, 'ios/App/CapApp-SPM/Package.swift'), 'utf8');
    if (!manifest.includes(`.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "${patchedCapacitorVersion}")`)) throw new Error('iOS manifest selects an unverified Capacitor version');
    const resolved = read('ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved');
    const pins = resolved.pins.filter(pin => pin.identity === 'capacitor-swift-pm');
    if (pins.length !== 1 || pins[0].location !== 'https://github.com/ionic-team/capacitor-swift-pm.git' || pins[0].state.version !== patchedCapacitorVersion || pins[0].state.revision !== capacitorSwiftRevision) throw new Error('iOS Capacitor pin differs from the verified vendor tag');
  }
  return runtime;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('[capacitor-runtime]', JSON.stringify(checkCapacitorRuntime(join(dirname(fileURLToPath(import.meta.url)), '..'), process.argv.includes('--native-records'))));
}
