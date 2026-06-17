#!/usr/bin/env node
/**
 * Download public Supabase storage URLs from Lovable export → Firebase Storage.
 * Preserves bucket/path so firebaseStorage.resolveMediaUrl() can resolve them.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
 *   npm run migrate:firebase:public-media
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TABLES_DIR = join(ROOT, 'export/lovable-cloud-export/tables');
const MAP_PATH = join(ROOT, 'export/media-url-map.json');

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(ROOT, 'secrets/firebase-admin.json');
if (!existsSync(SA_PATH)) {
  console.error(`❌ Service account not found at ${SA_PATH}`);
  process.exit(1);
}
if (!existsSync(TABLES_DIR)) {
  console.error(`❌ Missing ${TABLES_DIR} — unzip lovable-cloud-export.zip first`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SA_PATH, 'utf8'));
initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`,
});
const bucket = getStorage().bucket();

const PUBLIC_RE = /https?:\/\/[^/\s"]+\/storage\/v1\/object\/public\/([^/\s"]+)\/([^\s"]+)/g;

function collectUrls() {
  const urls = new Set();
  for (const file of readdirSync(TABLES_DIR).filter((f) => f.endsWith('.json'))) {
    const text = readFileSync(join(TABLES_DIR, file), 'utf8');
    for (const m of text.matchAll(PUBLIC_RE)) {
      urls.add(m[0].replace(/\\u0026/g, '&'));
    }
  }
  return [...urls];
}

function parsePublicUrl(url) {
  const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2].split('?')[0]) };
}

const urls = collectUrls();
console.log(`Found ${urls.length} public Supabase storage URLs\n`);

const map = {};
let uploaded = 0;
let skipped = 0;
let failed = 0;
const privateOrBad = [];

for (const url of urls) {
  const parsed = parsePublicUrl(url);
  if (!parsed) {
    privateOrBad.push(url);
    continue;
  }
  const dest = `${parsed.bucket}/${parsed.path}`;
  if (map[url]) continue;

  try {
    const [exists] = await bucket.file(dest).exists();
    if (exists) {
      const [signed] = await bucket.file(dest).getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 3600 * 1000,
      });
      map[url] = { dest, firebaseUrl: signed, status: 'cached' };
      skipped++;
      continue;
    }

    const res = await fetch(url);
    if (!res.ok) {
      failed++;
      privateOrBad.push(url);
      console.warn(`  ⚠️  ${res.status} ${url.slice(0, 90)}…`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || undefined;
    await bucket.file(dest).save(buf, {
      resumable: false,
      metadata: contentType ? { contentType } : undefined,
    });
    const [signed] = await bucket.file(dest).getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 3600 * 1000,
    });
    map[url] = { dest, firebaseUrl: signed, status: 'uploaded' };
    uploaded++;
    if (uploaded % 20 === 0) console.log(`  … ${uploaded} uploaded`);
  } catch (err) {
    failed++;
    console.warn(`  ⚠️  ${dest}: ${err.message}`);
  }
}

mkdirSync(join(ROOT, 'export'), { recursive: true });
writeFileSync(MAP_PATH, JSON.stringify({ migrated_at: new Date().toISOString(), map, failed: privateOrBad }, null, 2));

console.log(`\n✅ Public media: ${uploaded} uploaded, ${skipped} cached, ${failed} failed`);
console.log(`   Map → ${MAP_PATH}`);
if (privateOrBad.length) {
  console.log(`   ${privateOrBad.length} URLs need service_role (private bucket or 403)`);
}
