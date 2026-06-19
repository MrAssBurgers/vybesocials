import {
  getDocument,
  getDocuments,
  setDocument,
  where,
  firestoreLimit,
} from './firestoreDb';
import { firebaseAuth } from './authService';
import { resolveProfileIdFromAuthUid } from './profileResolve';

async function resolveTokenOwnerIds(): Promise<{ profileId: string; authUid: string } | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user?.id) return null;
  const profileId = (await resolveProfileIdFromAuthUid(user.id)) || user.id;
  return { profileId, authUid: user.id };
}

async function findTokenDoc(profileId: string, authUid: string) {
  const byDocId = await getDocument<Record<string, unknown>>('vybe_tokens', profileId);
  if (byDocId) return byDocId;

  const byAuthDoc = await getDocument<Record<string, unknown>>('vybe_tokens', authUid);
  if (byAuthDoc) return byAuthDoc;

  const byProfileQuery = await getDocuments<Record<string, unknown>>('vybe_tokens', [
    where('user_id', '==', profileId),
    firestoreLimit(1),
  ]);
  if (byProfileQuery[0]) return byProfileQuery[0];

  const byAuthQuery = await getDocuments<Record<string, unknown>>('vybe_tokens', [
    where('user_id', '==', authUid),
    firestoreLimit(1),
  ]);
  return byAuthQuery[0] ?? null;
}

/** Client-side earn_vybe_tokens — persists balance + transaction in Firestore. */
export async function rpcEarnVybeTokens(params: Record<string, unknown>): Promise<number> {
  const ids = await resolveTokenOwnerIds();
  if (!ids) throw new Error('Not authenticated');

  const amount = Number(params.p_amount ?? params.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid token amount');
  }

  const type = String(params.p_type ?? params.type ?? 'reward');
  const description = params.p_description != null ? String(params.p_description) : null;
  const referenceId = params.p_reference_id != null ? String(params.p_reference_id) : null;
  const explicitUserId = params.p_user_id ? String(params.p_user_id) : null;
  const ownerId =
    explicitUserId === ids.authUid || explicitUserId === ids.profileId
      ? ids.profileId
      : ids.profileId;

  const existing = await findTokenDoc(ids.profileId, ids.authUid);
  const now = new Date().toISOString();
  const docId = String(existing?.id ?? ownerId);
  const prevBalance = Number(existing?.balance ?? 0);
  const prevEarned = Number(existing?.lifetime_earned ?? 0);
  const prevSpent = Number(existing?.lifetime_spent ?? 0);
  const newBalance = prevBalance + amount;

  await setDocument('vybe_tokens', docId, {
    id: docId,
    user_id: ownerId,
    balance: newBalance,
    lifetime_earned: prevEarned + amount,
    lifetime_spent: prevSpent,
    updated_at: now,
  });

  const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await setDocument('token_transactions', txId, {
    id: txId,
    user_id: ownerId,
    amount,
    transaction_type: type,
    description,
    reference_id: referenceId,
    created_at: now,
  });

  return newBalance;
}

/** Must match MARKETPLACE_ITEMS in useTokenMarketplace.ts */
const MARKETPLACE_ITEM_COSTS: Record<string, number> = {
  theme_neon: 200,
  theme_ocean: 200,
  avatar_frame_gold: 350,
  avatar_frame_fire: 400,
  streak_shield: 60,
  xp_boost_2x: 75,
  token_boost_2x: 100,
  visibility_boost: 90,
  roulette_pack: 50,
};

const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

/** Lightweight client-side rate limit (Firestore has no public rate_limits collection). */
export function rpcCheckRateLimit(params: Record<string, unknown>): boolean {
  const key = String(params.p_key || '');
  const maxRequests = Number(params.p_max_requests ?? 10);
  const windowSeconds = Number(params.p_window_seconds ?? 60);
  if (!key || !Number.isFinite(maxRequests) || maxRequests <= 0) return true;

  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart > windowSeconds * 1000) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= maxRequests;
}

export interface PurchaseMarketplaceResult {
  success: boolean;
  error?: string;
  balance?: number;
  new_balance?: number;
}

/** Client-side purchase_marketplace_item — deduct tokens and record purchase in Firestore. */
export async function rpcPurchaseMarketplaceItem(
  params: Record<string, unknown>,
): Promise<PurchaseMarketplaceResult> {
  const ids = await resolveTokenOwnerIds();
  if (!ids) return { success: false, error: 'Not authenticated' };

  const itemId = String(params.p_item_id || '');
  const cost = Number(params.p_cost ?? 0);
  const description = params.p_description != null ? String(params.p_description) : 'Marketplace purchase';

  const expectedCost = MARKETPLACE_ITEM_COSTS[itemId];
  if (!expectedCost || expectedCost !== cost) {
    return { success: false, error: 'Invalid item or cost' };
  }

  const purchaseDocId = `${ids.profileId}_${itemId}`;
  const existingPurchase = await getDocument('marketplace_purchases', purchaseDocId);
  if (existingPurchase) {
    return { success: false, error: 'Already owned' };
  }

  const existing = await findTokenDoc(ids.profileId, ids.authUid);
  if (!existing) {
    return { success: false, error: 'No token account' };
  }

  const balance = Number(existing.balance ?? 0);
  if (balance < cost) {
    return { success: false, error: 'Insufficient tokens', balance };
  }

  const now = new Date().toISOString();
  const tokenDocId = String(existing.id ?? ids.profileId);
  const newBalance = balance - cost;

  await setDocument('vybe_tokens', tokenDocId, {
    id: tokenDocId,
    user_id: ids.profileId,
    balance: newBalance,
    lifetime_earned: Number(existing.lifetime_earned ?? 0),
    lifetime_spent: Number(existing.lifetime_spent ?? 0) + cost,
    updated_at: now,
  });

  const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await setDocument('token_transactions', txId, {
    id: txId,
    user_id: ids.profileId,
    amount: -cost,
    transaction_type: 'purchase',
    description,
    reference_id: itemId,
    created_at: now,
  });

  await setDocument('marketplace_purchases', purchaseDocId, {
    id: purchaseDocId,
    user_id: ids.profileId,
    item_id: itemId,
    cost,
    purchased_at: now,
  });

  return { success: true, new_balance: newBalance };
}
