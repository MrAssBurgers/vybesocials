import { createHash } from 'node:crypto';
import type { Firestore, Transaction, DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { isActivePremiumGrant, unexpired } from './premiumAuthority.js';

type Row = Record<string, unknown>;
export type TokenActor = { authUid: string; profileId: string };
export const tokenTupleId = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const review = () => new HttpsError('failed-precondition', 'This account or item needs verification. Historical balances and purchases have not been imported.');
const MAX_INVENTORY = 100;
const HOUR = 3_600_000;
export const TOKEN_CATALOG = [
  { id: 'theme_neon', name: 'Neon Nights Profile Effect', description: 'A neon color effect for your profile', perk: 'Equip on your profile', cost: 200, category: 'cosmetic', icon: '🌆', kind: 'permanent', available: true },
  { id: 'theme_ocean', name: 'Deep Ocean Profile Effect', description: 'Cool ocean colors for your profile', perk: 'Equip on your profile', cost: 200, category: 'cosmetic', icon: '🌊', kind: 'permanent', available: true },
  { id: 'avatar_frame_gold', name: 'Gold Avatar Frame', description: 'A shimmering gold frame around your avatar', perk: 'Equip from your inventory', cost: 350, category: 'cosmetic', icon: '🖼️', kind: 'permanent', available: true },
  { id: 'avatar_frame_fire', name: 'Fire Avatar Frame', description: 'Animated fire around your avatar', perk: 'Equip from your inventory', cost: 400, category: 'cosmetic', icon: '🔥', kind: 'permanent', available: true },
  { id: 'streak_shield', name: 'Streak Shield', description: 'Streak protection is not available yet', perk: 'Unavailable — no tokens charged', cost: 60, category: 'boost', icon: '🛡️', kind: 'consumable', available: false },
  { id: 'xp_boost_2x', name: '2× XP Boost', description: 'Double verified challenge XP claimed while active', perk: 'Activate one hour of verified challenge XP', cost: 75, category: 'boost', icon: '⚡', kind: 'consumable', available: true },
  { id: 'token_boost_2x', name: '2× Token Boost', description: 'Double eligible verified activity tokens while active', perk: 'Activate one hour of verified token rewards', cost: 100, category: 'boost', icon: '💰', kind: 'consumable', available: true },
  { id: 'visibility_boost', name: 'Post Visibility Boost', description: 'Promoted post delivery is not available yet', perk: 'Unavailable — no tokens charged', cost: 90, category: 'boost', icon: '📈', kind: 'consumable', available: false },
  { id: 'roulette_pack', name: 'Roulette 5-Pack', description: 'Extra spins are not available yet', perk: 'Unavailable — no tokens charged', cost: 50, category: 'feature', icon: '🎰', kind: 'consumable', available: false },
] as const;
type CatalogItem = typeof TOKEN_CATALOG[number];
const catalogItem = (id: unknown): CatalogItem => {
  const item = TOKEN_CATALOG.find(entry => entry.id === id);
  if (!item) throw new HttpsError('invalid-argument', 'Unknown item');
  if (!item.available) throw new HttpsError('failed-precondition', 'This item is not available. No tokens were charged.');
  return item;
};
const safeInt = (value: unknown, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw review();
  return value;
};
const isoDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const liveProfile = (row: Row) => !row.deleted_at && row.is_deleted !== true;
export function tokenRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', 'Invalid request ID');
  return value;
}

export async function resolveTokenActor(database: Firestore, uid: string): Promise<TokenActor> {
  const [profiles, index] = await Promise.all([
    database.collection('profiles').where('user_id', '==', uid).limit(2).get(),
    database.collection('user_auth_index').doc(uid).get(),
  ]);
  if (profiles.size !== 1 || !liveProfile(profiles.docs[0].data())) throw review();
  const profileId = profiles.docs[0].id;
  if (index.exists && index.data()?.profile_id !== profileId) throw review();
  return { authUid: uid, profileId };
}

async function readActor(tx: Transaction, database: Firestore, actor: TokenActor) {
  const [profile, index, profiles] = await Promise.all([
    tx.get(database.collection('profiles').doc(actor.profileId)), tx.get(database.collection('user_auth_index').doc(actor.authUid)),
    tx.get(database.collection('profiles').where('user_id', '==', actor.authUid).limit(2)),
  ]);
  if (!profile.exists || profile.data()?.user_id !== actor.authUid || !liveProfile(profile.data()!) || profiles.size !== 1 || profiles.docs[0].id !== actor.profileId
    || (index.exists && index.data()?.profile_id !== actor.profileId)) throw review();
  return profile;
}

export function verifiedTokenWallet(row: Row | undefined, uid: string, now: string) {
  if (!row) return { schema_version: 1, id: uid, user_id: uid, balance: 0, lifetime_earned: 0, lifetime_spent: 0, updated_at: now };
  if (row.schema_version !== 1 || row.user_id !== uid || row.id !== uid || !isoDate(row.updated_at)) throw review();
  const balance = safeInt(row.balance), earned = safeInt(row.lifetime_earned), spent = safeInt(row.lifetime_spent);
  if (earned - spent !== balance) throw review();
  return { schema_version: 1, id: uid, user_id: uid, balance, lifetime_earned: earned, lifetime_spent: spent, updated_at: row.updated_at };
}

function entitlement(row: Row | undefined, actor: TokenActor, item: CatalogItem) {
  if (!row) return null;
  if (row.schema_version !== 1 || row.user_id !== actor.authUid || row.item_id !== item.id || row.kind !== item.kind || !isoDate(row.purchased_at)) throw review();
  const quantity = safeInt(row.quantity, item.kind === 'permanent' ? 1 : MAX_INVENTORY);
  return { item_id: item.id, kind: item.kind, quantity, purchased_at: row.purchased_at };
}

function boostRow(row: Row | undefined, uid: string, type: string) {
  if (!row) return null;
  const item = type === 'xp_2x' ? 'xp_boost_2x' : type === 'tokens_2x' ? 'token_boost_2x' : null;
  if (!item || row.schema_version !== 1 || row.id !== tokenTupleId(uid, type) || row.user_id !== uid || row.boost_type !== type
    || row.source_item_id !== item || !isoDate(row.activated_at) || !isoDate(row.expires_at) || typeof row.consumed !== 'boolean'
    || row.uses_remaining !== null || Date.parse(row.expires_at) - Date.parse(row.activated_at) !== HOUR) throw review();
  return { id: row.id as string, boost_type: type, source_item_id: item, activated_at: row.activated_at, expires_at: row.expires_at,
    uses_remaining: null, consumed: row.consumed };
}

function replay(snap: DocumentSnapshot, actor: TokenActor, requestId: string, fingerprint: string): Row | null {
  if (!snap.exists) return null;
  const row = snap.data()!;
  if (row.schema_version !== 1 || row.user_id !== actor.authUid || row.request_id !== requestId) throw review();
  if (row.fingerprint !== fingerprint) throw new HttpsError('already-exists', 'This request ID was used for a different action.');
  if (!row.result || row.result.success !== true) throw review();
  return row.result as Row;
}

export async function purchaseTokenItem(database: Firestore, actor: TokenActor, input: Row, nowMs = Date.now()) {
  const item = catalogItem(input.itemId), requestId = tokenRequestId(input.requestId);
  if (!Number.isSafeInteger(input.expectedCost) || input.expectedCost !== item.cost) throw new HttpsError('failed-precondition', 'The item price changed. Refresh before buying.');
  const now = new Date(nowMs).toISOString(), fingerprint = JSON.stringify(['purchase', item.id, item.cost]);
  const requestRef = database.collection('_token_purchase_requests').doc(tokenTupleId(actor.authUid, requestId));
  const walletRef = database.collection('token_wallets').doc(actor.authUid);
  const inventoryRef = database.collection('token_entitlements').doc(tokenTupleId(actor.authUid, item.id));
  const eventRef = database.collection('token_events').doc(tokenTupleId(actor.authUid, 'purchase', requestId));
  return database.runTransaction(async tx => {
    const [, request, walletSnap, inventorySnap, event] = await Promise.all([
      readActor(tx, database, actor), tx.get(requestRef), tx.get(walletRef), tx.get(inventoryRef), tx.get(eventRef),
    ]);
    const prior = replay(request, actor, requestId, fingerprint); if (prior) return prior;
    if (event.exists) throw review();
    const wallet = verifiedTokenWallet(walletSnap.data(), actor.authUid, now);
    const owned = entitlement(inventorySnap.data(), actor, item);
    if (owned?.quantity && item.kind === 'permanent') throw new HttpsError('already-exists', 'You already own this item.');
    if ((owned?.quantity || 0) >= MAX_INVENTORY) throw new HttpsError('resource-exhausted', 'Use some inventory before purchasing more.');
    if (wallet.balance < item.cost) throw new HttpsError('failed-precondition', 'Not enough verified tokens. Historical balances may need review.');
    const balance = wallet.balance - item.cost, spent = safeInt(wallet.lifetime_spent + item.cost);
    const result = { success: true, balance, item_id: item.id };
    tx.set(walletRef, { ...wallet, balance, lifetime_spent: spent, updated_at: now });
    tx.set(inventoryRef, { schema_version: 1, user_id: actor.authUid, item_id: item.id, kind: item.kind,
      quantity: (owned?.quantity || 0) + 1, purchased_at: owned?.purchased_at || now, updated_at: now });
    tx.create(eventRef, { schema_version: 1, id: eventRef.id, user_id: actor.authUid, amount: -item.cost,
      transaction_type: 'purchase', description: `Purchased: ${item.name}`, reference_id: item.id, created_at: now });
    tx.create(requestRef, { schema_version: 1, user_id: actor.authUid, request_id: requestId, fingerprint, result, created_at: now });
    return result;
  });
}

export async function activateTokenBoost(database: Firestore, actor: TokenActor, input: Row, nowMs = Date.now()) {
  const item = catalogItem(input.itemId), requestId = tokenRequestId(input.requestId);
  const type = item.id === 'xp_boost_2x' ? 'xp_2x' : item.id === 'token_boost_2x' ? 'tokens_2x' : null;
  if (!type) throw new HttpsError('invalid-argument', 'This item cannot be activated');
  const now = new Date(nowMs).toISOString(), fingerprint = JSON.stringify(['activate', item.id]);
  const requestRef = database.collection('_token_purchase_requests').doc(tokenTupleId(actor.authUid, requestId));
  const inventoryRef = database.collection('token_entitlements').doc(tokenTupleId(actor.authUid, item.id));
  const boostRef = database.collection('token_boosts').doc(tokenTupleId(actor.authUid, type));
  return database.runTransaction(async tx => {
    const [, request, inventory, active] = await Promise.all([readActor(tx, database, actor), tx.get(requestRef), tx.get(inventoryRef), tx.get(boostRef)]);
    const prior = replay(request, actor, requestId, fingerprint); if (prior) return prior;
    const owned = entitlement(inventory.data(), actor, item), oldBoost = boostRow(active.data(), actor.authUid, type);
    if (!owned?.quantity) throw new HttpsError('failed-precondition', 'Buy a verified boost before activating it.');
    if (oldBoost && !oldBoost.consumed && Date.parse(oldBoost.expires_at) > nowMs) throw new HttpsError('failed-precondition', 'This boost is already active. Wait for it to end.');
    const boost = { id: boostRef.id, boost_type: type, source_item_id: item.id, activated_at: now,
      expires_at: new Date(nowMs + HOUR).toISOString(), uses_remaining: null, consumed: false };
    const result = { success: true, item_id: item.id, boost };
    tx.update(inventoryRef, { quantity: owned.quantity - 1, updated_at: now });
    tx.set(boostRef, { ...boost, schema_version: 1, user_id: actor.authUid });
    tx.create(requestRef, { schema_version: 1, user_id: actor.authUid, request_id: requestId, fingerprint, result, created_at: now });
    return result;
  });
}

export async function tokenMarketplaceState(database: Firestore, actor: TokenActor, nowMs = Date.now()) {
  return database.runTransaction(async tx => {
    const ownerIds = [...new Set([actor.authUid, actor.profileId])];
    const [, wallet, inventory, boosts, events, legacy, verifiedXp] = await Promise.all([
      readActor(tx, database, actor), tx.get(database.collection('token_wallets').doc(actor.authUid)),
      Promise.all(TOKEN_CATALOG.map(item => tx.get(database.collection('token_entitlements').doc(tokenTupleId(actor.authUid, item.id))))),
      Promise.all(['xp_2x', 'tokens_2x'].map(type => tx.get(database.collection('token_boosts').doc(tokenTupleId(actor.authUid, type))))),
      tx.get(database.collection('token_events').where('user_id', '==', actor.authUid).orderBy('created_at', 'desc').limit(20)),
      Promise.all(['vybe_tokens', 'marketplace_purchases', 'user_active_boosts'].map(name => tx.get(database.collection(name).where('user_id', 'in', ownerIds).limit(1)))),
      tx.get(database.collection('_verified_xp_authority').doc(actor.authUid)),
    ]);
    const transactions = events.docs.map(doc => {
      const row = doc.data();
      if (row.schema_version !== 1 || row.user_id !== actor.authUid || !Number.isSafeInteger(row.amount) || !isoDate(row.created_at)) throw review();
      return { id: doc.id, user_id: actor.authUid, amount: row.amount, transaction_type: String(row.transaction_type || ''),
        description: typeof row.description === 'string' ? row.description : null, reference_id: typeof row.reference_id === 'string' ? row.reference_id : null, created_at: row.created_at };
    });
    return { wallet: verifiedTokenWallet(wallet.data(), actor.authUid, new Date(nowMs).toISOString()), transactions,
      inventory: inventory.map((snap, index) => entitlement(snap.data(), actor, TOKEN_CATALOG[index])).filter(row => row !== null && row.quantity > 0),
      boosts: boosts.map((snap, index) => boostRow(snap.data(), actor.authUid, ['xp_2x', 'tokens_2x'][index]))
        .filter(row => row !== null && !row.consumed && Date.parse(row.activated_at) <= nowMs && Date.parse(row.expires_at) > nowMs),
      catalog: TOKEN_CATALOG, legacy_review: legacy.some(snapshot => !snapshot.empty), verified_total_xp: verifiedXpValue(verifiedXp.data(), actor),
    };
  });
}

function verifiedXpValue(row: Row | undefined, actor: TokenActor): number {
  if (!row) return 0;
  if (row.schema_version !== 1 || row.user_id !== actor.authUid || row.profile_id !== actor.profileId) throw review();
  return safeInt(row.verified_total_xp);
}

const EQUIP_FIELDS = { title: 'equipped_title', effect: 'equipped_effect', frame: 'equipped_frame', name_color: 'equipped_name_color', profile_theme: 'equipped_profile_theme', badge: 'equipped_badge_id' } as const;
const PAID_EQUIP: Record<string, string> = { avatar_frame_gold: 'frame', avatar_frame_fire: 'frame', theme_neon: 'profile_theme', theme_ocean: 'profile_theme' };
const RESTRICTED_COLORS: Record<string, 'owner' | 'moderator'> = { Gold: 'owner', 'Diamond White': 'owner', Holographic: 'owner', 'Shield Silver': 'moderator', 'Justice Blue': 'moderator', 'Guardian Green': 'moderator' };

export async function equipTokenItem(database: Firestore, actor: TokenActor, input: Row, nowMs = Date.now()) {
  if (typeof input.type !== 'string' || !Object.hasOwn(EQUIP_FIELDS, input.type) || (input.value !== null && (typeof input.value !== 'string' || !input.value || input.value.length > 128 || input.value.includes('/')))) {
    throw new HttpsError('invalid-argument', 'Invalid cosmetic selection');
  }
  const type = input.type as keyof typeof EQUIP_FIELDS, value = input.value as string | null, field = EQUIP_FIELDS[type];
  return database.runTransaction(async tx => {
    const profile = await readActor(tx, database, actor);
    if (value === null && profile.data()?.[field] === null) return { success: true, type, value };
    if (value !== null) {
      if (Object.hasOwn(PAID_EQUIP, value)) {
        if (PAID_EQUIP[value] !== type) throw new HttpsError('invalid-argument', 'Cosmetic type does not match');
        const item = catalogItem(value);
        const owned = entitlement((await tx.get(database.collection('token_entitlements').doc(tokenTupleId(actor.authUid, value)))).data(), actor, item);
        if (!owned?.quantity) throw new HttpsError('permission-denied', 'This cosmetic requires a verified purchase.');
      } else if (type === 'badge') {
        await verifyBadgeEquip(tx, database, actor, value, nowMs);
      } else {
        await verifyTierEquip(tx, database, actor, type, value, nowMs);
      }
    }
    // Re-selecting a visible legacy/expired cosmetic must not certify it. Only
    // skip the write after the same current authority checks have succeeded.
    if (profile.data()?.[field] === value) return { success: true, type, value };
    tx.update(profile.ref, { [field]: value, updated_at: new Date(nowMs).toISOString() });
    return { success: true, type, value };
  });
}

async function verifyBadgeEquip(tx: Transaction, database: Firestore, actor: TokenActor, badgeId: string, nowMs: number) {
  const [definition, grants, staffProof, challengeProofs] = await Promise.all([
    tx.get(database.collection('badges').doc(badgeId)),
    tx.get(database.collection('user_badges').where('user_id', 'in', [...new Set([actor.authUid, actor.profileId])]).where('badge_id', '==', badgeId).limit(2)),
    tx.get(database.collection('_badge_grant_authority').doc(tokenTupleId(actor.authUid, badgeId))),
    tx.get(database.collection('_challenge_reward_authority').where('auth_uid', '==', actor.authUid).where('badge_id', '==', badgeId).limit(100)),
  ]);
  if (!definition.exists || grants.empty || grants.size > 1) throw review();
  const grant = grants.docs[0].data();
  if (grant.expires_at != null && !unexpired(grant.expires_at, nowMs)) throw new HttpsError('failed-precondition', 'This badge has expired.');
  const proof = staffProof.data();
  const staffVerified = !!proof && proof.schema_version === 1 && proof.source === 'staff' && proof.user_id === actor.authUid
    && proof.profile_id === actor.profileId && proof.badge_id === badgeId && proof.active === true && proof.revoked_at === null
    && proof.grant_id === grants.docs[0].id && isoDate(proof.issued_at) && (proof.expires_at === null || unexpired(proof.expires_at, nowMs));
  const challengeVerified = !staffProof.exists && challengeProofs.docs.some(doc => {
    const row = doc.data();
    return row.version === 1 && row.auth_uid === actor.authUid && row.profile_id === actor.profileId && row.badge_id === badgeId && row.is_claimed === true && row.legacy_claimed === false;
  });
  if (!staffVerified && !challengeVerified) throw review();
}

async function verifyTierEquip(tx: Transaction, database: Firestore, actor: TokenActor, type: string, value: string, nowMs: number) {
  const [tiers, verifiedXp, premium, subscription, roles] = await Promise.all([
    tx.get(database.collection('battle_pass_tiers').limit(501)), tx.get(database.collection('_verified_xp_authority').doc(actor.authUid)),
    tx.get(database.collection('premium_grants').doc(actor.authUid)), tx.get(database.collection('subscriptions').doc(actor.authUid)),
    Promise.all(['user_roles', 'user_roles_auth'].map(name => tx.get(database.collection(name).where('user_id', 'in', [...new Set([actor.authUid, actor.profileId])]).limit(20)))),
  ]);
  if (tiers.size > 500 || roles.some(snapshot => snapshot.size >= 20)) throw review();
  const activeRoles = roles.flatMap(snapshot => snapshot.docs.map(doc => doc.data())).filter(row => !Object.hasOwn(row, 'enabled') || row.enabled === true).map(row => row.role);
  const owner = activeRoles.includes('owner'), moderator = owner || activeRoles.includes('admin') || activeRoles.includes('moderator');
  const rewardType = type === 'frame' ? 'cosmetic' : type;
  const matching = tiers.docs.filter(doc => { const row = doc.data(); return row.reward_type === rewardType && (row.reward_name === value || row.reward_id === value); });
  if (matching.length !== 1) throw new HttpsError('failed-precondition', 'This cosmetic is not in the verified catalog.');
  const tier = matching[0].data();
  // An alternate reward ID must retain the canonical color's staff restriction.
  const restrictions = type === 'name_color' ? [value, tier.reward_name, tier.reward_id]
    .filter((name): name is string => typeof name === 'string').map(name => RESTRICTED_COLORS[name]) : [];
  const restricted = restrictions.includes('owner') ? 'owner' : restrictions.includes('moderator') ? 'moderator' : null;
  if ((restricted === 'owner' && !owner) || (restricted === 'moderator' && !moderator)) throw new HttpsError('permission-denied', 'This color is reserved for an active staff role.');
  const level = safeInt(tier.level, 100_000), requiredXp = safeInt(tier.xp_required);
  if (level < 1 || typeof tier.is_premium !== 'boolean') throw review();
  if (tier.is_premium) {
    const sub = subscription.data();
    if (!owner && !isActivePremiumGrant(premium.data(), actor.authUid, nowMs) && !(sub?.status === 'active' && unexpired(sub.expires_at, nowMs))) {
      throw new HttpsError('permission-denied', 'Verified Premium access is required. Native purchase verification may still be pending.');
    }
  } else if (level > 1 && !restricted && verifiedXpValue(verifiedXp.data(), actor) < requiredXp) {
    throw new HttpsError('failed-precondition', 'This tier needs verified earned XP. Historical progress may need review.');
  }
}
