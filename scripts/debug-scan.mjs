#!/usr/bin/env node
/**
 * Full VYBE debug scan — run when user says "do a debug".
 * Usage: npm run debug
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function envValue(name) {
  for (const f of ['.env', '.env.local']) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(new RegExp(`${name}=(.+)`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const FIREBASE_PROJECT_ID = envValue('VITE_FIREBASE_PROJECT_ID') || 'vybe-daaab';
const FUNCTIONS_REGION = envValue('VITE_FIREBASE_FUNCTIONS_REGION') || 'us-central1';
const FUNCTIONS_BASE = `https://${FUNCTIONS_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || ''), code: r.status ?? 1 };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function probe(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
    const text = await res.text().catch(() => '');
    return { status: res.status, ok: res.ok, text: text.slice(0, 240) };
  } catch (e) {
    return { status: 0, ok: false, error: String(e) };
  }
}

/** Firebase callable — POST empty data; 401/403 = deployed + auth gate; 400 = deployed + validation. */
async function probeCallable(label, url) {
  const r = await probe(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  });
  const deployed =
    r.status === 401 ||
    r.status === 403 ||
    r.status === 400 ||
    r.text?.includes('UNAUTHENTICATED') ||
    r.text?.includes('invalid-argument') ||
    r.text?.includes('Sign in required');
  return { label, ...r, pass: deployed };
}

/** Public HTTP function — health probe or expected validation response. */
async function probeHttp(label, url, { healthQuery = '?probe=1' } = {}) {
  const health = await probe(`${url}${healthQuery}`);
  if (health.status === 200) {
    return { label, ...health, pass: true, detail: 'health ok' };
  }
  const bare = await probe(url, { method: 'GET' });
  const deployed =
    bare.status === 400 ||
    bare.status === 404 ||
    bare.text?.includes('postId required') ||
    bare.text?.includes('not found');
  return { label, ...bare, pass: deployed, detail: deployed ? 'http handler' : 'not deployed' };
}

async function main() {
  console.log('VYBE debug scan (Firebase)');
  console.log(`Project: ${FIREBASE_PROJECT_ID}`);
  console.log(`Time: ${new Date().toISOString()}`);

  section('Frontend — build');
  const build = run('npm', ['run', 'build'], { stdio: 'pipe' });
  console.log(build.ok ? 'PASS npm run build' : `FAIL npm run build (exit ${build.code})`);
  if (!build.ok) console.log(build.out.slice(-800));

  section('Frontend — lint');
  const lint = run('npm', ['run', 'lint'], { stdio: 'pipe' });
  console.log(lint.ok ? 'PASS npm run lint' : `FAIL npm run lint (exit ${lint.code})`);

  section('Frontend — CSS');
  const css = run('npm', ['run', 'validate:css'], { stdio: 'pipe' });
  console.log(css.ok ? 'PASS npm run validate:css' : 'WARN validate:css');

  section('Frontend — boot entry');
  const boot = run('npm', ['run', 'validate:boot'], { stdio: 'pipe' });
  console.log(boot.ok ? 'PASS npm run validate:boot' : `FAIL npm run validate:boot (exit ${boot.code})`);
  if (!boot.ok) console.log(boot.out.trim());

  section('Cloud Functions — local vs client references');
  const fnDir = join(root, 'functions/src');
  const localFns = new Set(
    readdirSync(fnDir)
      .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
      .flatMap((f) => {
        const src = readFileSync(join(fnDir, f), 'utf8');
        const names = [...src.matchAll(/export const (\w+)/g)].map((m) => m[1]);
        return names;
      }),
  );
  const invoked = new Set();
  const rg = run('rg', [
    '-o',
    "functions\\.invoke\\(['\"]([a-z0-9_-]+)['\"]",
    'src',
    '--no-heading',
  ], { stdio: 'pipe' });
  if (rg.ok) {
    for (const line of rg.out.split('\n')) {
      const m = line.match(/invoke\(['"]([a-z0-9_-]+)['"]/);
      if (m) invoked.add(m[1]);
    }
  }
  const kebabToCamel = (n) => n.replace(/[-_]([a-z0-9])/g, (_, c) => c.toUpperCase());
  const missing = [...invoked].filter((name) => !localFns.has(kebabToCamel(name)));
  console.log(`Client invokes ${invoked.size} function names; ${localFns.size} exports in functions/src`);
  if (missing.length) {
    console.log(`WARN missing local exports for: ${missing.join(', ')}`);
  } else {
    console.log('OK — referenced callables resolve to functions/src exports');
  }

  section('Production probes (Firebase)');
  const callableProbes = [
    ['livekitToken', `${FUNCTIONS_BASE}/livekitToken`],
    ['aiCatchUp', `${FUNCTIONS_BASE}/aiCatchUp`],
  ];
  const httpProbes = [['sharePreview', `${FUNCTIONS_BASE}/sharePreview`]];

  for (const [label, url] of httpProbes) {
    const r = await probeHttp(label, url);
    const status = r.status || r.error || 'ERR';
    const suffix = r.detail ? ` (${r.detail})` : '';
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${label}: HTTP ${status}${suffix}`);
  }
  for (const [label, url] of callableProbes) {
    const r = await probeCallable(label, url);
    const status = r.status || r.error || 'ERR';
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${label} (callable): HTTP ${status}`);
  }

  section('Git status');
  const git = run('git', ['status', '--short'], { stdio: 'pipe' });
  console.log(git.out.trim() || '(clean)');

  console.log('\n=== Summary ===');
  console.log('- Backend: Firebase (Firestore + Cloud Functions + Auth)');
  console.log('- Deploy: firebase deploy --only hosting,firestore:rules,functions');
  console.log('- Web prod: Lovable → Share → Publish for vybehub.app');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
