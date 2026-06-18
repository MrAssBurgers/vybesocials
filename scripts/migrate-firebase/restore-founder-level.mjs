#!/usr/bin/env node
/**
 * Restore founder (@mrassburgers) VYBE Pass level when progress was split across
 * duplicate accounts or lost during OAuth migration.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json \
 *   node scripts/migrate-firebase/restore-founder-level.mjs [--level=49]
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from './_adminInit.mjs';

const TARGET_LEVEL = Number(process.argv.find((a) => a.startsWith('--level='))?.split('=')[1] || 49);

const MRASS_PROFILE_ID = 'e78010f2-d5f1-428b-b5df-8fc6b768772d';
const MRASS_AUTH_UID = '703760a8-1245-4fc1-b242-32619ecc0ef3';
const LEVEL_DOC_ID = '5dd990ce-3ada-4259-baba-770d549cbacc';

initFirebaseAdmin();
const db = getFirestore();

async function main() {
  const tiersSnap = await db.collection('battle_pass_tiers').get();
  const tierByLevel = new Map();
  for (const doc of tiersSnap.docs) {
    const data = doc.data();
    const level = Number(data.level);
    if (!tierByLevel.has(level) || Number(data.xp_required) < Number(tierByLevel.get(level).xp_required)) {
      tierByLevel.set(level, data);
    }
  }

  const targetTier = tierByLevel.get(TARGET_LEVEL);
  if (!targetTier) throw new Error(`No battle_pass_tier for level ${TARGET_LEVEL}`);

  const targetXp = Number(targetTier.xp_required);
  const existing = await db.collection('user_levels').doc(LEVEL_DOC_ID).get();
  const prev = existing.data() || {};
  const prevLevel = Number(prev.current_level || 0);
  const prevXp = Number(prev.total_xp || 0);

  if (prevLevel >= TARGET_LEVEL && prevXp >= targetXp) {
    console.log(`[skip] Founder already level ${prevLevel} with ${prevXp} XP`);
    return;
  }

  const unclaimed = [];
  for (let level = Math.max(prevLevel + 1, 2); level <= TARGET_LEVEL; level++) {
    const tier = tierByLevel.get(level);
    if (!tier) continue;
    unclaimed.push({
      level,
      reward_id: tier.reward_id ?? null,
      reward_icon: tier.reward_icon ?? '⭐',
      reward_name: tier.reward_name ?? `Level ${level}`,
      reward_type: tier.reward_type ?? 'cosmetic',
    });
  }

  const now = new Date().toISOString();
  const row = {
    id: LEVEL_DOC_ID,
    user_id: MRASS_AUTH_UID,
    profile_id: MRASS_PROFILE_ID,
    current_level: TARGET_LEVEL,
    total_xp: Math.max(prevXp, targetXp),
    unclaimed_rewards: unclaimed,
    updated_at: now,
    created_at: prev.created_at || now,
  };

  await db.collection('user_levels').doc(LEVEL_DOC_ID).set(row, { merge: true });
  console.log(`[restored] mrassburgers level ${prevLevel}→${TARGET_LEVEL}, XP ${prevXp}→${row.total_xp}`);
  console.log(`[restored] unclaimed rewards: ${unclaimed.length} tiers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
