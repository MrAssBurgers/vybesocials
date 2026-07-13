#!/usr/bin/env node
/**
 * Shadow compare legacy inbox badges vs semantic relationship projection fields.
 * Usage: node scripts/relationship-shadow-compare.mjs [--viewer=PROFILE_ID]
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const viewerArg = process.argv.find((a) => a.startsWith('--viewer='));
const viewerId = viewerArg?.split('=')[1];

if (!getApps().length) {
  initializeApp();
}
const db = getFirestore();

async function main() {
  let query = db.collection('dm_inbox_entries').where('conversation_type', '==', 'direct');
  if (viewerId) query = query.where('viewer_id', '==', viewerId);
  const snap = await query.limit(200).get();

  const mismatches = [];
  let legacyOnly = 0;
  let semanticOnly = 0;
  let aligned = 0;

  for (const doc of snap.docs) {
    const row = doc.data();
    const legacy = row.relationship_badge;
    const semantic = row.primary_relationship_state;
    const rank = row.best_friend_rank;

    const hasLegacy = legacy === 'close_friend' || legacy === 'new_friend';
    const hasSemantic = Boolean(semantic) || rank != null;

    if (hasLegacy && !hasSemantic) legacyOnly += 1;
    else if (!hasLegacy && hasSemantic) semanticOnly += 1;
    else aligned += 1;

    if (hasLegacy && hasSemantic && legacy === 'close_friend' && rank == null) {
      mismatches.push({
        id: doc.id,
        legacy,
        semantic,
        rank,
        note: 'close_friend badge without ranked best_friend',
      });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    scanned: snap.size,
    legacyOnly,
    semanticOnly,
    aligned,
    mismatchCount: mismatches.length,
    sampleMismatches: mismatches.slice(0, 20),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
