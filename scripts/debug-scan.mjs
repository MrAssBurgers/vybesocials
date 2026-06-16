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
const PROD_REF = 'hprmicwhlaaqfgshucec';
const PROD_URL = `https://${PROD_REF}.supabase.co`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || ''), code: r.status ?? 1 };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const CANONICAL_HPRMIC_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwcm1pY3dobGFhcWZnc2h1Y2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNDkwODgsImV4cCI6MjA4NDYyNTA4OH0.Lk72yBKNj3sRjf5E5DQ8TLBfXB2tbjTpAAb075hbMa4';

function loadAnonKey() {
  for (const f of ['.env', '.env.local']) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.+)/);
    if (m) {
      const key = m[1].trim().replace(/^["']|["']$/g, '');
      if (key.includes(PROD_REF)) return key;
    }
  }
  return CANONICAL_HPRMIC_ANON;
}

async function probe(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: 0, ok: false, error: String(e) };
  }
}

async function main() {
  console.log('VYBE debug scan');
  console.log(`Production: ${PROD_URL}`);
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

  section('Edge functions — local vs client references');
  const fnDir = join(root, 'supabase/functions');
  const localFns = new Set(
    readdirSync(fnDir).filter((d) => !d.startsWith('_') && !d.startsWith('.')),
  );
  const invoked = new Set();
  const rg = run('rg', [
    '-o',
    "functions\\.invoke\\(['\"]([^'\"]+)|functions/v1/([a-z0-9-]+)",
    'src',
  ], { stdio: 'pipe' });
  if (rg.ok) {
    for (const line of rg.out.split('\n')) {
      const m = line.match(/invoke\(['"]([^'"]+)/) || line.match(/functions\/v1\/([a-z0-9-]+)/);
      if (m?.[1]) invoked.add(m[1]);
    }
  }
  const missing = [...invoked].filter((n) => !localFns.has(n)).sort();
  console.log(`Local functions: ${localFns.size}`);
  console.log(`Referenced from src: ${invoked.size}`);
  if (missing.length) {
    console.log('MISSING locally:', missing.join(', '));
  } else {
    console.log('OK — all referenced functions exist in supabase/functions/');
  }

  section('Production — critical RPCs');
  const anon = loadAnonKey();
  const rpcHeaders = {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    'Content-Type': 'application/json',
  };
  for (const rpc of [
    'get_public_user_count',
    'sync_signup_username',
    'ensure_user_level',
    'is_username_available',
    'ensure_profile',
    'create_dm_conversation',
  ]) {
    const { status } = await probe(`${PROD_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: rpcHeaders,
      body: '{}',
    });
    const label =
      status === 200 ? 'OK' :
      status === 404 ? 'MISSING' :
      status === 400 ? 'HTTP 400 (auth/body required — OK)' :
      `HTTP ${status}`;
    console.log(`${rpc}: ${label}`);
  }

  section('Production — sample edge functions (anon POST)');
  const samples = [
    'ai-chat',
    'vybe-agent',
    'livekit-token',
    'share-preview',
    'giphy-search',
    'ai-catch-up',
    'community-voice-token',
    'send-push-notification',
    'link-onesignal-user',
    'spaces-token',
    'generate-advanced-theme',
    'auth-2fa-preauth',
  ];
  for (const fn of samples) {
    const { status } = await probe(`${PROD_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: '{}',
    });
    let note = 'deployed';
    if (status === 404) note = 'NOT DEPLOYED';
    else if (status === 401 || status === 403) note = 'deployed (auth required)';
    else if (status === 400) note = 'deployed (needs body)';
    console.log(`${fn}: HTTP ${status} — ${note}`);
  }

  section('Git');
  const st = run('git', ['status', '-sb'], { stdio: 'pipe' });
  console.log(st.out.trim() || '(clean)');

  section('vybehub.app bundle');
  const html = await fetch('https://vybehub.app/index.html').then((r) => r.text()).catch(() => '');
  const bundle = html.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? 'unknown';
  console.log(`index.html bundle: ${bundle}`);

  section('Reminders');
  console.log('- Web deploy: Lovable → Share → Publish (vybehub.app)');
  console.log(`- Supabase prod ref: ${PROD_REF} (see DEPLOY.md)`);
  console.log('- Edge functions: deploy on agtcyx (ai-chat, vybe-agent, etc.)');
  console.log('- SQL: apply supabase/manual/PENDING_20260530.sql on agtcyx if RPCs MISSING');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
