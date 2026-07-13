#!/usr/bin/env node
/**
 * Resumable dm_inbox_entries backfill (Admin SDK).
 * Loops until a page returns fewer than `limit` membership rows.
 *
 *   node scripts/backfill-dm-inbox.mjs
 *   CURSOR=... LIMIT=100 node scripts/backfill-dm-inbox.mjs
 */
import { initFirebaseAdmin } from './migrate-firebase/_adminInit.mjs';
import { getFirestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

initFirebaseAdmin();
const db = getFirestore();

const limit = Math.min(Math.max(Number(process.env.LIMIT) || 80, 1), 200);
let cursor = process.env.CURSOR || null;
let totalProcessed = 0;
let totalWrote = 0;
let pages = 0;

async function loadProjection() {
  const modPath = resolve(ROOT, 'functions/lib/dmInboxProjection.js');
  return import(pathToFileURL(modPath).href);
}

async function pageOnce(upsertInboxEntry) {
  let query = db.collection('conversation_members').orderBy('__name__').limit(limit);
  if (cursor) {
    const cursorSnap = await db.collection('conversation_members').doc(cursor).get();
    if (!cursorSnap.exists) {
      throw new Error(`Cursor doc not found: ${cursor}`);
    }
    query = query.startAfter(cursorSnap);
  }

  const snap = await query.get();
  const seen = new Set();
  let wrote = 0;

  for (const doc of snap.docs) {
    const member = doc.data() || {};
    const conversationId =
      typeof member.conversation_id === 'string' ? member.conversation_id : null;
    const viewerId = typeof member.user_id === 'string' ? member.user_id : null;
    if (!conversationId || !viewerId) continue;
    const key = `${viewerId}_${conversationId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await upsertInboxEntry(conversationId, viewerId);
    wrote += 1;
  }

  const last = snap.docs[snap.docs.length - 1];
  cursor = last?.id || null;
  const done = snap.size < limit;

  return { processed: snap.size, wrote, nextCursor: cursor, done };
}

async function main() {
  const { upsertInboxEntry } = await loadProjection();
  if (typeof upsertInboxEntry !== 'function') {
    throw new Error('upsertInboxEntry not exported from functions/lib/dmInboxProjection.js — run functions build');
  }

  console.log(`[backfill] start limit=${limit} cursor=${cursor || '(start)'}`);

  while (true) {
    pages += 1;
    const result = await pageOnce(upsertInboxEntry);
    totalProcessed += result.processed;
    totalWrote += result.wrote;
    console.log(
      `[backfill] page=${pages} processed=${result.processed} wrote=${result.wrote} cursor=${result.nextCursor || 'null'} done=${result.done}`,
    );
    if (result.done) {
      console.log(
        `[backfill] COMPLETE totalProcessed=${totalProcessed} totalWrote=${totalWrote} pages=${pages}`,
      );
      return;
    }
    // Brief pause to avoid hammering Firestore.
    await new Promise((r) => setTimeout(r, 150));
  }
}

main().catch((err) => {
  console.error('[backfill] FAIL', err);
  if (cursor) console.error(`[backfill] resume with CURSOR=${cursor}`);
  process.exit(1);
});
