import { getFirebaseAuth } from '@/lib/firebase/authService';
import { invokeFunction } from '@/lib/firebase/functionsService';
import type { TokenBalance, TokenTransaction } from '@/lib/tokenMath';
import type { MarketplaceItem } from '@/hooks/useTokenMarketplace';
import type { ActiveBoost } from '@/hooks/useActiveBoosts';

export type TokenEarnType = 'daily_login' | 'post_created' | 'comment_added' | 'challenge_completed';
export type EquipType = 'title' | 'effect' | 'frame' | 'name_color' | 'profile_theme' | 'badge';
export interface TokenInventoryItem { item_id: string; quantity: number; kind: 'permanent' | 'consumable'; purchased_at: string }
export interface TokenMarketplaceState {
  wallet: TokenBalance; transactions: TokenTransaction[]; inventory: TokenInventoryItem[];
  boosts: ActiveBoost[]; catalog: MarketplaceItem[]; legacy_review: boolean; verified_total_xp: number;
}
export interface TokenActionResult { success: true; balance?: number; item_id?: string; credited?: number; already_credited?: boolean; type?: EquipType; value?: string | null; boost?: ActiveBoost }
export type TokenRequest = { action: 'state' }
  | { action: 'purchase'; itemId: string; requestId: string; expectedCost: number }
  | { action: 'activate'; itemId: string; requestId: string }
  | { action: 'equip'; type: EquipType; value: string | null }
  | { action: 'earn'; type: TokenEarnType; referenceId?: string };

let observedAuth: ReturnType<typeof getFirebaseAuth>;
let observedUid: string | undefined;
let epoch = 0;
let unsubscribe: (() => void) | undefined;
export function tokenAccountSnapshot() {
  const auth = getFirebaseAuth();
  if (auth !== observedAuth) {
    unsubscribe?.(); observedAuth = auth; observedUid = auth?.currentUser?.uid; epoch++;
    unsubscribe = auth?.onAuthStateChanged(user => { if (observedUid !== user?.uid) { observedUid = user?.uid; epoch++; } });
  }
  if (observedUid !== auth?.currentUser?.uid) { observedUid = auth?.currentUser?.uid; epoch++; }
  return { uid: observedUid, epoch };
}
export type TokenAccountGuard = () => void;
export function tokenAccountGuard(expectedUid = tokenAccountSnapshot().uid): TokenAccountGuard {
  const started = tokenAccountSnapshot();
  return () => {
    const current = tokenAccountSnapshot();
    if (!expectedUid || current.uid !== expectedUid || current.epoch !== started.epoch) throw Object.assign(new Error('Your account changed. Please try again.'), { code: 'account-changed' });
  };
}
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function validBoost(value: unknown): value is ActiveBoost {
  if (!row(value) || typeof value.id !== 'string' || typeof value.consumed !== 'boolean' || value.uses_remaining !== null
    || typeof value.activated_at !== 'string' || typeof value.expires_at !== 'string') return false;
  const item = value.boost_type === 'xp_2x' ? 'xp_boost_2x' : value.boost_type === 'tokens_2x' ? 'token_boost_2x' : null;
  return !!item && value.source_item_id === item && Number.isFinite(Date.parse(value.activated_at))
    && Date.parse(value.expires_at) - Date.parse(value.activated_at) === 60 * 60 * 1000;
}
export function validateTokenState(value: unknown, uid: string): TokenMarketplaceState {
  if (!row(value) || !row(value.wallet) || value.wallet.user_id !== uid || !integer(value.wallet.balance)
    || !integer(value.wallet.lifetime_earned) || !integer(value.wallet.lifetime_spent)
    || !Array.isArray(value.transactions) || !Array.isArray(value.inventory) || !Array.isArray(value.boosts) || !Array.isArray(value.catalog)
    || typeof value.legacy_review !== 'boolean' || !integer(value.verified_total_xp)) throw new Error('Wallet service returned an invalid response. Please try again.');
  if (value.inventory.some(item => !row(item) || typeof item.item_id !== 'string' || !integer(item.quantity) || !['permanent', 'consumable'].includes(String(item.kind)))
    || value.catalog.some(item => !row(item) || typeof item.id !== 'string' || !['name', 'description', 'icon', 'perk'].every(key => typeof item[key] === 'string') || !['cosmetic', 'feature', 'boost', 'unlock'].includes(String(item.category)) || !integer(item.cost) || typeof item.available !== 'boolean' || !['permanent', 'consumable'].includes(String(item.kind)))
    || value.transactions.some(tx => !row(tx) || typeof tx.id !== 'string' || tx.user_id !== uid || !Number.isSafeInteger(tx.amount) || typeof tx.created_at !== 'string' || !(typeof tx.description === 'string' || tx.description === null))
    || value.boosts.some(boost => !validBoost(boost))) throw new Error('Wallet service returned invalid inventory. Please try again.');
  return value as unknown as TokenMarketplaceState;
}

export async function tokenMarketplaceRequest(request: { action: 'state' }, guard?: TokenAccountGuard): Promise<TokenMarketplaceState>;
export async function tokenMarketplaceRequest(request: Exclude<TokenRequest, { action: 'state' }>, guard?: TokenAccountGuard): Promise<TokenActionResult>;
export async function tokenMarketplaceRequest(request: TokenRequest, guard = tokenAccountGuard()): Promise<TokenMarketplaceState | TokenActionResult> {
  guard(); const uid = tokenAccountSnapshot().uid!;
  const { data, error } = await invokeFunction<unknown>('token-marketplace', request);
  guard();
  if (error) throw Object.assign(new Error(error.message || 'Token service is unavailable. Please try again.'), { code: error.code || error.name });
  if (request.action === 'state') return validateTokenState(data, uid);
  if (!row(data) || data.success !== true) throw new Error(row(data) && typeof data.error === 'string' ? data.error : 'The token action was not confirmed. Please try again.');
  if (['purchase', 'earn'].includes(request.action) && !integer(data.balance)) throw new Error('The token balance was not confirmed. Please refresh your wallet.');
  if (request.action === 'earn' && !integer(data.credited)) throw new Error('The token reward was not confirmed. Please try again.');
  if ((request.action === 'purchase' || request.action === 'activate') && data.item_id !== request.itemId) throw new Error('The requested item was not confirmed. Please refresh your inventory.');
  if (request.action === 'activate' && (!validBoost(data.boost) || data.boost.source_item_id !== request.itemId)) throw new Error('The boost activation was not confirmed. Please refresh your inventory.');
  if (request.action === 'equip' && (data.type !== request.type || data.value !== request.value)) throw new Error('The equipment change was not confirmed. Please refresh your profile.');
  return data as unknown as TokenActionResult;
}

// Receipts survive a reload in this tab. Authentication epochs guard requests,
// while storage keys stay account/action/item/price scoped for safe recovery.
const attempts = new Map<string, string>();
const ATTEMPT_STORAGE = 'vybe-token-attempts-v1';
const MAX_ATTEMPTS = 64;
function storedAttempts(): Record<string, string> {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(ATTEMPT_STORAGE) || '{}');
    if (!row(stored)) return {};
    const entries = Object.entries(stored).filter((entry): entry is [string, string] => entry[0].length <= 1500 && typeof entry[1] === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(entry[1]));
    return Object.fromEntries(entries.slice(-MAX_ATTEMPTS));
  } catch { return {}; }
}
function persistAttempt(key: string, id: string | null) {
  try {
    const stored = storedAttempts();
    if (id) stored[key] = id; else delete stored[key];
    sessionStorage.setItem(ATTEMPT_STORAGE, JSON.stringify(Object.fromEntries(Object.entries(stored).slice(-MAX_ATTEMPTS))));
  } catch { /* Restricted storage still has in-memory retry protection. */ }
}
export function tokenAttempt(action: 'purchase' | 'activate', uid: string, itemId: string, expectedCost?: number) {
  const key = JSON.stringify([uid, action, itemId, expectedCost]);
  let requestId = attempts.get(key) || storedAttempts()[key];
  if (!requestId) { requestId = crypto.randomUUID(); attempts.set(key, requestId); }
  attempts.set(key, requestId); persistAttempt(key, requestId);
  while (attempts.size > MAX_ATTEMPTS) attempts.delete(attempts.keys().next().value!);
  return { requestId, complete: () => { if (attempts.get(key) === requestId) attempts.delete(key); if (storedAttempts()[key] === requestId) persistAttempt(key, null); } };
}
