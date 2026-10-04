import { db, getFirebaseAuth } from '@/lib/firebase';

export interface PremiumGift {
  id: string;
  user_id: string;
  gifted_by: string;
  status: 'pending' | 'accepted' | 'revoked';
  is_active: boolean;
  is_expired: boolean;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}
export interface PendingPremiumGift { id: string; user_id: string; gifterUsername: string; expires_at: string | null }
export interface VerifiedPremiumStatus { active: boolean; gift_active: boolean; is_owner: boolean; can_manage_gifts: boolean; expires_at: string | null }

export const isPremiumAccountCurrent = (uid: string | undefined): uid is string => !!uid && getFirebaseAuth()?.currentUser?.uid === uid;
export function isPremiumAccountChanged(error: unknown): boolean { return error instanceof Error && error.name === 'PremiumAccountChanged'; }
function assertAccount(uid: string): void {
  if (isPremiumAccountCurrent(uid)) return;
  const error = new Error('Your account changed. Please try again.'); error.name = 'PremiumAccountChanged'; throw error;
}
async function invoke<T>(uid: string, name: string, body: Record<string, unknown>): Promise<T> {
  assertAccount(uid);
  const { data, error } = await db.functions.invoke<T>(name, { body });
  assertAccount(uid);
  if (error) throw new Error(error.message || 'This service is temporarily unavailable.');
  if (!data || typeof data !== 'object') throw new Error('The service returned an incomplete response.');
  return data;
}
function gift(value: unknown): PremiumGift {
  if (!value || typeof value !== 'object') throw new Error('Gift details are unavailable.');
  const row = value as PremiumGift;
  if (typeof row.id !== 'string' || typeof row.user_id !== 'string' || typeof row.gifted_by !== 'string'
    || !['pending', 'accepted', 'revoked'].includes(row.status) || typeof row.is_active !== 'boolean'
    || typeof row.is_expired !== 'boolean') throw new Error('Gift details are incomplete.');
  return row;
}
export async function listPremiumGifts(uid: string, userIds?: string[]): Promise<PremiumGift[]> {
  const result = await invoke<{ gifts: unknown[] }>(uid, 'premium-gift-manage', { action: 'list', ...(userIds ? { userIds } : {}) });
  if (!Array.isArray(result.gifts)) throw new Error('Gift details are unavailable.');
  return result.gifts.map(gift);
}
export async function createPremiumGift(uid: string, recipientUserId: string, requestId: string): Promise<PremiumGift> {
  const result = await invoke<{ ok: boolean; gift: unknown }>(uid, 'premium-gift-manage', { action: 'create', recipientUserId, requestId });
  const created = gift(result.gift);
  if (result.ok !== true || created.user_id !== recipientUserId || created.status === 'revoked' || created.is_expired) throw new Error('This gift changed. Refresh and try again.');
  return created;
}
export async function revokePremiumGift(uid: string, recipientUserId: string, grantId: string): Promise<void> {
  const result = await invoke<{ ok: boolean; gift: unknown }>(uid, 'premium-gift-manage', { action: 'revoke', recipientUserId, grantId });
  const revoked = gift(result.gift);
  if (result.ok !== true || revoked.user_id !== recipientUserId || revoked.id !== grantId || revoked.status !== 'revoked') throw new Error('The gift could not be revoked.');
}
export async function acceptPremiumGift(uid: string, grantId: string): Promise<void> {
  const result = await invoke<{ ok: boolean; gift: unknown }>(uid, 'premium-gift-manage', { action: 'accept', grantId });
  const accepted = gift(result.gift);
  if (result.ok !== true || accepted.user_id !== uid || accepted.id !== grantId || accepted.status !== 'accepted' || !accepted.is_active || accepted.is_expired) throw new Error('The gift could not be accepted.');
}
export async function pendingPremiumGift(uid: string): Promise<PendingPremiumGift | null> {
  const result = await invoke<{ gift: PendingPremiumGift | null }>(uid, 'premium-gift-manage', { action: 'pending' });
  if (result.gift === null) return null;
  if (typeof result.gift?.id !== 'string' || result.gift.user_id !== uid || typeof result.gift.gifterUsername !== 'string') throw new Error('Gift details are unavailable.');
  return result.gift;
}
export async function verifiedPremiumStatus(uid: string): Promise<VerifiedPremiumStatus> {
  const result = await invoke<VerifiedPremiumStatus>(uid, 'check-premium-subscription', {});
  if (typeof result.active !== 'boolean' || typeof result.gift_active !== 'boolean' || typeof result.is_owner !== 'boolean'
    || typeof result.can_manage_gifts !== 'boolean' || !(result.expires_at === null || (typeof result.expires_at === 'string' && Number.isFinite(Date.parse(result.expires_at))))) throw new Error('Premium status is unavailable.');
  return result;
}
