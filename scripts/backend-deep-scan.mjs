#!/usr/bin/env node
/**
 * Deep backend scan — Firebase + Supabase production probes.
 *
 * Usage: node scripts/backend-deep-scan.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnvFile(name) {
  const path = join(ROOT, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://hprmicwhlaaqfgshucec.supabase.co';
const SUPABASE_ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

const rows = [];
function pass(label, detail = '') { rows.push({ status: 'PASS', label, detail }); }
function warn(label, detail = '') { rows.push({ status: 'WARN', label, detail }); }
function fail(label, detail = '') { rows.push({ status: 'FAIL', label, detail }); }

async function probeUrl(label, url, opts = {}) {
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      signal: AbortSignal.timeout(15000),
    });
    return { label, status: res.status, ok: res.ok };
  } catch (e) {
    return { label, status: 0, error: e.message };
  }
}

async function probeSupabaseRpc(name) {
  if (!SUPABASE_ANON) return { name, status: 'SKIP', detail: 'no anon key' };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 404) return { name, status: 'MISSING' };
  if (res.status === 400 || res.status === 401 || res.status === 200) return { name, status: 'OK' };
  return { name, status: `HTTP ${res.status}` };
}

async function probeSupabaseEdge(name) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 404) return { name, status: 'MISSING' };
  if ([200, 400, 401, 403, 405].includes(res.status)) return { name, status: 'OK' };
  return { name, status: `HTTP ${res.status}` };
}

async function firebaseAdminChecks() {
  const saPath = join(ROOT, 'secrets/firebase-admin.json');
  if (!existsSync(saPath)) {
    warn('Firebase Admin', 'secrets/firebase-admin.json missing — skip live counts');
    return;
  }
  const { initFirebaseAdmin } = await import('./migrate-firebase/_adminInit.mjs');
  initFirebaseAdmin();
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const db = getFirestore();
  const auth = getAuth();

  const [profiles, index, posts, messages] = await Promise.all([
    db.collection('profiles').count().get(),
    db.collection('user_auth_index').count().get(),
    db.collection('posts').count().get(),
    db.collection('messages').count().get(),
  ]);

  const authUsers = await auth.listUsers(1000);
  const p = profiles.data().count;
  const i = index.data().count;
  const a = authUsers.users.length;

  if (p === a && i === a) pass('Firebase auth↔profiles', `${a} users, index ${i}`);
  else fail('Firebase auth↔profiles', `profiles=${p} auth=${a} index=${i}`);

  pass('Firebase data counts', `posts=${posts.data().count} messages=${messages.data().count}`);

  const repair = spawnSync(process.execPath, [join(__dirname, 'migrate-firebase/verify-firestore-connections.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (repair.status === 0) pass('Firestore user-data refs', '100% connected');
  else fail('Firestore user-data refs', repair.stderr?.slice(0, 200) || 'verify failed');
}

function checkFirestoreRulesCoverage() {
  const rulesPath = join(ROOT, 'firestore.rules');
  if (!existsSync(rulesPath)) {
    warn('Firestore social rules', 'firestore.rules missing');
    return;
  }
  const rules = readFileSync(rulesPath, 'utf8');
  const required = ['match /likes/', 'match /friend_requests/', 'receiver_id', 'match /message_requests/', 'match /sounds/', 'match /vybe_dna/'];
  const missing = required.filter((needle) => !rules.includes(needle));
  if (missing.length === 0) pass('Firestore social rules', 'likes, friends, DMs, sounds covered');
  else fail('Firestore social rules', `missing: ${missing.join(', ')}`);
}

async function main() {
  console.log('VYBE backend deep scan');
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Local build/lint
  for (const [cmd, args, label] of [
    ['npm', ['run', 'build'], 'Frontend build'],
    ['npm', ['run', 'lint'], 'Frontend lint'],
  ]) {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) pass(label);
    else fail(label, r.stderr?.slice(0, 120) || 'failed');
  }

  // vybehub.app vs local bundle
  const localJs = join(ROOT, 'dist/assets/app.js');
  let localEtag = null;
  if (existsSync(localJs)) {
    const crypto = await import('node:crypto');
    const buf = readFileSync(localJs);
    localEtag = crypto.createHash('md5').update(buf).digest('hex');
  }
  const prod = await probeUrl('vybehub.app app.js', 'https://vybehub.app/assets/app.js', { method: 'HEAD' });
  const prodEtag = prod.status ? (await fetch('https://vybehub.app/assets/app.js', { method: 'HEAD' }).then((r) => r.headers.get('etag')?.replace(/"/g, ''))) : null;
  if (prod.status === 200) {
    if (localEtag && prodEtag && localEtag === prodEtag) pass('vybehub.app bundle', 'matches local build');
    else warn('vybehub.app bundle', `STALE — prod etag ${prodEtag?.slice(0, 12)}… vs local ${localEtag?.slice(0, 12)}… → Lovable Publish required`);
  } else fail('vybehub.app bundle', `HTTP ${prod.status}`);

  const fbHosting = await probeUrl('Firebase Hosting backup', 'https://vybe-daaab.web.app/assets/app.js', { method: 'HEAD' });
  if (fbHosting.status === 200) pass('Firebase Hosting (web.app)', 'HTTP 200');
  else warn('Firebase Hosting (web.app)', `HTTP ${fbHosting.status} — not primary prod domain`);

  // Supabase RPCs
  const rpcs = ['get_public_user_count', 'sync_signup_username', 'ensure_user_level', 'ensure_profile', 'is_username_available', 'create_dm_conversation'];
  for (const name of rpcs) {
    const r = await probeSupabaseRpc(name);
    if (r.status === 'OK') pass(`Supabase RPC ${name}`, 'deployed');
    else if (r.status === 'MISSING') warn(`Supabase RPC ${name}`, 'missing — Firebase client fallback');
    else if (r.status === 'SKIP') warn(`Supabase RPC ${name}`, r.detail || 'skipped');
    else fail(`Supabase RPC ${name}`, r.status);
  }

  // Supabase edge samples
  const edges = ['share-preview', 'ai-catch-up', 'livekit-token', 'link-onesignal-user', 'auth-2fa-preauth'];
  for (const name of edges) {
    const r = await probeSupabaseEdge(name);
    if (r.status === 'OK') pass(`Supabase edge ${name}`, 'deployed');
    else if (r.status === 'MISSING') fail(`Supabase edge ${name}`, '404');
    else warn(`Supabase edge ${name}`, r.status);
  }

  await firebaseAdminChecks();
  checkFirestoreRulesCoverage();

  console.log('\n── Results ──');
  for (const r of rows) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} [${r.status}] ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
  }

  const fails = rows.filter((r) => r.status === 'FAIL').length;
  const warns = rows.filter((r) => r.status === 'WARN').length;
  console.log(`\nSummary: ${rows.length - fails - warns} pass, ${warns} warn, ${fails} fail`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
