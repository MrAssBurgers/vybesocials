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
