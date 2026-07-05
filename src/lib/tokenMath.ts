/**
 * Pure token math + row parsing for the VYBE token wallet.
 * Kept dependency-free so the money path is unit-testable.
 */

export interface TokenBalance {
  id: string;
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  updated_at: string;
}

export interface TokenTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Coerce a raw vybe_tokens row into a TokenBalance — no unchecked casts. */
export function parseTokenBalance(row: unknown, fallbackUserId: string): TokenBalance {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: typeof r.id === 'string' ? r.id : '',
    user_id: typeof r.user_id === 'string' ? r.user_id : fallbackUserId,
    balance: finiteNumber(r.balance),
    lifetime_earned: finiteNumber(r.lifetime_earned),
    lifetime_spent: finiteNumber(r.lifetime_spent),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date().toISOString(),
  };
}

/** Coerce a raw token_transactions row; null when the row has no usable id. */
export function parseTokenTransaction(row: unknown): TokenTransaction | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    user_id: typeof r.user_id === 'string' ? r.user_id : '',
    amount: finiteNumber(r.amount),
    transaction_type: typeof r.transaction_type === 'string' ? r.transaction_type : 'unknown',
    description: typeof r.description === 'string' ? r.description : null,
    reference_id: typeof r.reference_id === 'string' ? r.reference_id : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : new Date(0).toISOString(),
  };
}

/**
 * Reward amount after DNA multiplier and the token-shop 2x boost.
 * Always a non-negative integer — fractional or negative rewards never
 * reach the earn RPC.
 */
export function applyTokenMultiplier(
  base: number,
  dnaMultiplier: number,
  has2xBoost: boolean,
): number {
  const safeBase = finiteNumber(base);
  const safeMultiplier = finiteNumber(dnaMultiplier, 1);
  const raw = safeBase * (safeMultiplier > 0 ? safeMultiplier : 1) * (has2xBoost ? 2 : 1);
  return Math.max(0, Math.round(raw));
}
