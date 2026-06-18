#!/usr/bin/env node
/**
 * Verify + document Firebase Authentication setup for VYBE (vybe-daaab).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json npm run firebase:configure-auth
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'vybe-daaab';
const PRODUCTION_ORIGIN = 'https://vybehub.app';

const REQUIRED_DOMAINS = [
  'vybehub.app',
  'www.vybehub.app',
  'localhost',
  'vybe-daaab.firebaseapp.com',
  'vybe-daaab.web.app',
];

function initAdmin() {
  if (admin.apps.length) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && existsSync(credPath)) {
    const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: PROJECT_ID,
    });
    return;
  }
  admin.initializeApp({ projectId: PROJECT_ID });
}

async function getAuthConfig() {
  initAdmin();
  const cred = admin.app().options.credential;
  if (!cred) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json');
  const { access_token } = await cred.getAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`,
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  if (!res.ok) throw new Error(`Config fetch ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  console.log(`Firebase Auth configure check — ${PROJECT_ID}\n`);

  const config = await getAuthConfig();
  const signIn = config.signIn ?? {};
  const authorizedDomains = config.authorizedDomains ?? [];

  console.log('Sign-in providers:');
  console.log('  email/password:', signIn.email?.enabled ? 'ON' : 'OFF');
  console.log('  phone:', signIn.phoneNumber?.enabled ? 'ON' : 'OFF');

  console.log('\nAuthorized domains:');
  for (const d of REQUIRED_DOMAINS) {
    const ok = authorizedDomains.includes(d);
    console.log(`  ${ok ? '✓' : '✗'} ${d}`);
  }

  const missing = REQUIRED_DOMAINS.filter((d) => !authorizedDomains.includes(d));
  if (missing.length) {
    console.log('\nAdding missing authorized domains via API...');
    const cred = admin.app().options.credential;
    const { access_token } = await cred.getAccessToken();
    const merged = [...new Set([...authorizedDomains, ...missing])];
    const patch = await fetch(
      `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config?updateMask=authorizedDomains`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authorizedDomains: merged }),
      },
    );
    if (patch.ok) {
      console.log('  ✓ Authorized domains updated:', missing.join(', '));
    } else {
      console.log('  ✗ Could not auto-add domains — add in Firebase Console:');
      for (const d of missing) console.log(`    - ${d}`);
    }
  }

  console.log('\nPassword reset email (manual — API template update blocked on this project):');
  console.log('  Firebase Console → Authentication → Templates → Password reset');
  console.log(`  Action URL: ${PRODUCTION_ORIGIN}/reset-password`);
  console.log(`  HTML: ${join(ROOT, 'functions/src/_shared/emailTemplates/recovery.html')}`);
  console.log('  Or run: npm run firebase:sync-email-templates');

  console.log('\nClient env (vybehub.app / Lovable):');
  console.log('  VITE_FIREBASE_* must point at vybe-daaab');
  console.log('  Auth is Firebase-only — Supabase is data/legacy RPCs only');

  console.log('\nReset flow:');
  console.log('  1. Client calls send-reset-email → requestPasswordReset Cloud Function');
  console.log('  2. Function uses Identity Toolkit sendOobCode (Firebase sends email)');
  console.log('  3. User lands on /reset-password on vybehub.app');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
