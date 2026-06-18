/**
 * Default Firebase Admin init for migrate/repair scripts.
 * Uses secrets/firebase-admin.json when GOOGLE_APPLICATION_CREDENTIALS is unset.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export function initFirebaseAdmin() {
  if (getApps().length) return getApps()[0];

  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(ROOT, 'secrets/firebase-admin.json');
  if (!existsSync(saPath)) {
    console.error(`❌ Firebase service account not found at ${saPath}`);
    console.error('   Set GOOGLE_APPLICATION_CREDENTIALS or add secrets/firebase-admin.json');
    process.exit(1);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
  }

  const serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
  const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;

  if (!projectId) {
    console.error('❌ FIREBASE_PROJECT_ID missing and not in service account JSON');
    process.exit(1);
  }

  process.env.FIREBASE_PROJECT_ID = projectId;

  return initializeApp({
    credential: cert(serviceAccount),
    projectId,
  });
}
