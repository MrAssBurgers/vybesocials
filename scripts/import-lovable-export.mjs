#!/usr/bin/env node
/**
 * Import Lovable Cloud JSON export (lovable-cloud-export.zip) into Firestore.
 *
 * Prereq: unzip to ./export/lovable-cloud-export/tables/*.json
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
 *   npm run migrate:firebase:import-lovable
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TABLES_DIR = join(ROOT, 'export/lovable-cloud-export/tables');
const BATCH_SIZE = 400;
const MAX_FIELD_BYTES = 900_000; // Firestore limit ~1 MiB per field

function sanitizeRow(row, tableName) {
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > MAX_FIELD_BYTES) {
      console.warn(`  ⚠️  ${tableName}/${out.id}: dropped oversized "${key}" (${value.length} chars)`);
      delete out[key];
      out[`_${key}_truncated`] = true;
    }
  }
  return out;
}

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(ROOT, 'secrets/firebase-admin.json');
if (!existsSync(SA_PATH)) {
  console.error(`❌ Service account not found at ${SA_PATH}`);
  process.exit(1);
}
if (!existsSync(TABLES_DIR)) {
  console.error(`❌ Tables dir missing: ${TABLES_DIR}`);
  console.error('   Unzip lovable-cloud-export.zip → export/lovable-cloud-export/');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SA_PATH, 'utf8'));
initializeApp({
  credential: cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
});
const db = getFirestore();

const files = readdirSync(TABLES_DIR).filter((f) => f.endsWith('.json'));
console.log(`Importing ${files.length} tables → Firestore (${serviceAccount.project_id})\n`);

let totalDocs = 0;
for (const file of files) {
  const tableName = file.replace(/\.json$/, '');
  const raw = readFileSync(join(TABLES_DIR, file), 'utf8');
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    console.warn(`  ⚠️  skip ${tableName} (invalid JSON)`);
    continue;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`  ⤼ skip ${tableName} (empty)`);
    continue;
  }

  const col = db.collection(tableName);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const row of chunk) {
      const id = String(row.id ?? row.uuid ?? col.doc().id);
      batch.set(col.doc(id), sanitizeRow(row, tableName), { merge: true });
    }
    await batch.commit();
  }
  totalDocs += rows.length;
  console.log(`  ✓ ${tableName}: ${rows.length}`);
}

console.log(`\n✅ Done — ${totalDocs} documents across ${files.length} collections.`);
