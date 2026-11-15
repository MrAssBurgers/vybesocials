import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertTokenAccountContext, type TokenAccountContext } from './tokenAccountAdmission.js';

type Actor = { authUid: string; profileId: string; account?: TokenAccountContext };
type Row = Record<string, unknown>;
export const TOKEN_LEDGER_OWNER = '_token_account_authority';
const review = () => new HttpsError('failed-precondition', 'Your token history needs an ownership review. Existing balances and purchases have been preserved.', { reason: 'token-ownership-review' });

/** Stamp every authoritative row, not only the ledger root. Older deployed
 * writers do not observe the root; their late unscoped rows must never become
 * new spending, XP, multipliers or replay authority. */
export function tokenLedgerRecordStamp(actor: Actor): Row {
  if (!actor.account) return {};
  assertTokenAccountContext(actor.account, actor.authUid);
  return { auth_created_at_ms: actor.account.createdAtMs, profile_id: actor.profileId };
}

export function assertTokenLedgerRecord(row: Row | undefined, actor: Actor): void {
  if (!row) return;
  if (!actor.account) {
    if (Object.hasOwn(row, 'auth_created_at_ms')) throw review();
    return;
  }
  assertTokenAccountContext(actor.account, actor.authUid);
  if (row.auth_created_at_ms !== actor.account.createdAtMs || row.profile_id !== actor.profileId) throw review();
}
function bindingMatches(row: Row | undefined, actor: Actor): boolean {
  return !!actor.account && !!row && row.version === 1 && row.status === 'active'
    && row.owner_uid === actor.authUid && row.profile_id === actor.profileId
    && row.auth_created_at_ms === Math.floor(actor.account.createdAtMs / 1000) * 1000
    && typeof row.revision === 'string' && /^[a-f0-9]{48}$/.test(row.revision);
}
function ownerMatches(row: Row | undefined, binding: Row | undefined, actor: Actor): boolean {
  return bindingMatches(binding, actor) && !!row && row.schema_version === 1 && row.owner_uid === actor.authUid
    && row.profile_id === actor.profileId && row.auth_created_at_ms === actor.account!.createdAtMs
    && row.binding_revision === binding!.revision && typeof row.created_at === 'string'
    && Number.isFinite(Date.parse(row.created_at)) && new Date(row.created_at).toISOString() === row.created_at;
}

/** Never automatically reassign or delete this durable owner record. All
 * descendants belong to this account lifetime, including replay receipts. */
export async function assertTokenLedgerOwner(tx: Transaction, db: Firestore, actor: Actor): Promise<void> {
  const owner = await tx.get(db.collection(TOKEN_LEDGER_OWNER).doc(actor.authUid));
  // Compatibility is only for unanchored internal writers during the staged
  // cutover. Once ownership exists, an old writer cannot bypass it.
  if (!owner.exists && !actor.account) return;
  if (!actor.account) throw review();
  assertTokenAccountContext(actor.account, actor.authUid);
  const binding = await tx.get(db.collection('_account_profile_bindings').doc(actor.authUid));
  if (!ownerMatches(owner.data(), binding.data(), actor)) throw review();
}

/** Initialize only an empty private ledger. Historical/browser-writable rows
 * are never imported, overwritten, reset or used as proof of new spending. */
export async function initializeTokenLedgerOwner(tx: Transaction, db: Firestore, actor: Actor): Promise<void> {
  if (!actor.account) return assertTokenLedgerOwner(tx, db, actor);
  assertTokenAccountContext(actor.account, actor.authUid);
  const ref = db.collection(TOKEN_LEDGER_OWNER).doc(actor.authUid);
  const [owner, binding] = await Promise.all([tx.get(ref), tx.get(db.collection('_account_profile_bindings').doc(actor.authUid))]);
  if (!bindingMatches(binding.data(), actor)) throw review();
  if (owner.exists) {
    if (!ownerMatches(owner.data(), binding.data(), actor)) throw review();
    return;
  }
  const aliases = [...new Set([actor.authUid, actor.profileId])];
  const tables = ['token_wallets', 'token_entitlements', 'token_boosts', 'token_events', '_token_purchase_requests', '_token_credit_receipts', '_token_credit_day_limits', '_verified_xp_authority', '_badge_grant_authority'];
  const history = await Promise.all([
    ...tables.map(table => tx.get(db.collection(table).where('user_id', 'in', aliases).limit(1))),
    tx.get(db.collection('_challenge_reward_authority').where('auth_uid', 'in', aliases).limit(1)),
  ]);
  const direct = await Promise.all(['token_wallets', '_token_credit_day_limits', '_verified_xp_authority'].map(table => tx.get(db.collection(table).doc(actor.authUid))));
  if (history.some(query => !query.empty) || direct.some(doc => doc.exists)) throw review();
  tx.create(ref, { schema_version: 1, owner_uid: actor.authUid, profile_id: actor.profileId,
    auth_created_at_ms: actor.account.createdAtMs, binding_revision: binding.data()!.revision, created_at: new Date().toISOString() });
}
