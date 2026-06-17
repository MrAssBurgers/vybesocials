#!/usr/bin/env node
/**
 * Push branded auth email HTML into Firebase Authentication templates.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
 *   FIREBASE_PROJECT_ID=vybe-daaab \
 *   npm run firebase:sync-email-templates
 *
 * Optional: --only recovery,signup
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'vybe-daaab';
const TEMPLATE_DIR = join(ROOT, 'functions/src/_shared/emailTemplates');

const SUBJECTS = {
  recovery: 'Reset your VYBE password',
  signup: 'Activate your VYBE account',
  'magic-link': 'Your VYBE login link',
  invite: "You're invited to VYBE",
  'email-change': 'Confirm your VYBE email change',
  reauthentication: 'Your VYBE verification code',
};

/** Firebase Identity Platform config field names */
const CONFIG_KEYS = {
  recovery: 'resetPasswordTemplate',
  signup: 'verifyEmailTemplate',
  'magic-link': 'signInWithEmailLinkTemplate',
  invite: 'inviteTemplate',
  'email-change': 'changeEmailTemplate',
  reauthentication: 'revertSecondFactorAdditionTemplate',
};

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

async function getToken() {
  initAdmin();
  const cred = admin.app().options.credential;
  if (!cred) throw new Error('No Firebase credential — set GOOGLE_APPLICATION_CREDENTIALS');
  const { access_token } = await cred.getAccessToken();
  if (!access_token) throw new Error('Failed to obtain access token');
  return access_token;
}

async function syncTemplate(name) {
  const configKey = CONFIG_KEYS[name];
  if (!configKey) {
    console.warn(`Skip ${name} — no Firebase config mapping`);
    return;
  }

  const html = readFileSync(join(TEMPLATE_DIR, `${name}.html`), 'utf8');
  const subject = SUBJECTS[name];
  const updateMask = `notification.sendEmail.${configKey}.body,notification.sendEmail.${configKey}.subject,notification.sendEmail.${configKey}.bodyFormat`;

  const body = {
    notification: {
      sendEmail: {
        [configKey]: {
          body: html,
          subject,
          bodyFormat: 'HTML',
        },
      },
    },
  };

  const url = `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config?updateMask=${encodeURIComponent(updateMask)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    if (err.includes('EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED')) {
      console.warn(`\n⚠ ${name}: API template update not enabled on this project.`);
      console.warn('  Paste manually in Firebase Console → Authentication → Templates → Password reset:');
      console.warn(`  File: ${join(TEMPLATE_DIR, `${name}.html`)}`);
      console.warn(`  Subject: ${subject}`);
      console.warn('  Action URL: https://vybehub.app/reset-password');
      console.warn('  (Enable Identity Platform or use Console HTML editor — templates use %LINK% / %EMAIL% tokens.)\n');
      return;
    }
    throw new Error(`${name}: HTTP ${res.status} — ${err.slice(0, 500)}`);
  }

  console.log(`✓ ${name} → ${configKey} (${(html.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only'));
  const only = onlyArg
    ? onlyArg.split('=')[1]?.split(',') || process.argv[process.argv.indexOf('--only') + 1]?.split(',')
    : null;

  const templates = only?.length ? only : ['recovery'];
  console.log(`Syncing Firebase auth email templates → ${PROJECT_ID}`);
  for (const name of templates) {
    await syncTemplate(name.trim());
  }
  console.log('Done. Password reset emails now use branded HTML via Firebase Auth.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
