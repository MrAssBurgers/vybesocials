import { tokenAccountGuard, tokenAccountSnapshot, tokenAttempt, tokenMarketplaceRequest, type TokenEarnType } from '@/lib/tokenMarketplaceService';

/** Compatibility adapter: reward values are derived only by the callable. */
export async function rpcEarnVybeTokens(params: Record<string, unknown>): Promise<number> {
  const type = String(params.p_type ?? params.type ?? '');
  if (!['daily_login', 'post_created', 'comment_added', 'challenge_completed'].includes(type)) throw new Error('This token reward is not available');
  const referenceId = typeof params.p_reference_id === 'string' ? params.p_reference_id : undefined;
  const result = await tokenMarketplaceRequest({ action: 'earn', type: type as TokenEarnType, referenceId });
  return result.balance!;
}

/** UI pacing only. Server-side rate limits remain authoritative. */
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();
export function rpcCheckRateLimit(params: Record<string, unknown>): boolean {
  const key = String(params.p_key || '');
  const maxRequests = Number(params.p_max_requests ?? 10);
  const windowSeconds = Number(params.p_window_seconds ?? 60);
  if (!key || !Number.isFinite(maxRequests) || maxRequests <= 0) return true;
  const now = Date.now(); const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart > windowSeconds * 1000) { rateLimitBuckets.set(key, { count: 1, windowStart: now }); return true; }
  bucket.count++; return bucket.count <= maxRequests;
}
export interface PurchaseMarketplaceResult { success: boolean; error?: string; balance?: number; new_balance?: number }
export async function rpcPurchaseMarketplaceItem(params: Record<string, unknown>): Promise<PurchaseMarketplaceResult> {
  const guard = tokenAccountGuard(); guard();
  const uid = tokenAccountSnapshot().uid!;
  const itemId = String(params.p_item_id || ''); const expectedCost = Number(params.p_cost);
  const attempt = tokenAttempt('purchase', uid, itemId, expectedCost);
  const result = await tokenMarketplaceRequest({ action: 'purchase', itemId, expectedCost, requestId: attempt.requestId }, guard);
  attempt.complete();
  return { success: true, balance: result.balance, new_balance: result.balance };
}
