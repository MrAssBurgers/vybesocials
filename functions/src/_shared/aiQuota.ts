import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin.js';

export type AiFeature = 'chat' | 'assist' | 'smart_replies';

export const CHEAP_CHAT_MODEL = 'gemini-2.5-flash-lite';

const LIMITS = {
  free: { chat: 25, assist: 15, smart_replies: 20 },
  premium: { chat: 250, assist: 120, smart_replies: 120 },
} as const;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function resolveProfileIdFromAuth(authUid: string): Promise<string> {
  const idx = await db.collection('user_auth_index').doc(authUid).get();
  const fromIndex = idx.data()?.profile_id as string | undefined;
  if (fromIndex) return fromIndex;

  const prof = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
  if (!prof.empty) return prof.docs[0].id;

  return authUid;
}

export async function isPremiumProfile(profileId: string): Promise<boolean> {
  const gifted = await db
    .collection('gifted_premium')
    .where('recipient_id', '==', profileId)
    .where('active', '==', true)
    .limit(1)
    .get();
  if (!gifted.empty) return true;

  const prof = await db.collection('profiles').doc(profileId).get();
  const authUid = prof.data()?.user_id as string | undefined;
  if (!authUid) return false;

  const sub = await db.collection('subscriptions').doc(authUid).get();
  return sub.exists && (sub.data()?.status as string) === 'active';
}

export async function getUserAiApiKey(
  profileId: string,
  provider: 'google' | 'openai' = 'google',
): Promise<string | null> {
  const snap = await db.collection('user_ai_keys').doc(`${profileId}_${provider}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as { api_key?: string; is_active?: boolean };
  if (data.is_active === false) return null;
  const key = typeof data.api_key === 'string' ? data.api_key.trim() : '';
  return key || null;
}

function countField(feature: AiFeature): string {
  if (feature === 'chat') return 'chat_count';
  if (feature === 'assist') return 'assist_count';
  return 'smart_replies_count';
}

export interface AiQuotaStatus {
  profileId: string;
  isPremium: boolean;
  hasByok: boolean;
  date: string;
  chat: { used: number; limit: number };
  assist: { used: number; limit: number };
  smart_replies: { used: number; limit: number };
}

export async function readAiQuotaStatus(profileId: string): Promise<AiQuotaStatus> {
  const [premium, byokGoogle, byokOpenai, usageSnap] = await Promise.all([
    isPremiumProfile(profileId),
    getUserAiApiKey(profileId, 'google'),
    getUserAiApiKey(profileId, 'openai'),
    db.collection('ai_usage').doc(profileId).get(),
  ]);

  const limits = premium ? LIMITS.premium : LIMITS.free;
  const usage = usageSnap.data() || {};
  const date = todayUtc();
  const stale = usage.date !== date;

  return {
    profileId,
    isPremium: premium,
    hasByok: !!(byokGoogle || byokOpenai),
    date,
    chat: { used: stale ? 0 : Number(usage.chat_count || 0), limit: limits.chat },
    assist: { used: stale ? 0 : Number(usage.assist_count || 0), limit: limits.assist },
    smart_replies: {
      used: stale ? 0 : Number(usage.smart_replies_count || 0),
      limit: limits.smart_replies,
    },
  };
}

/** Throws resource-exhausted when over daily limit (skipped when user BYOK is active). */
export async function enforceAiQuota(profileId: string, feature: AiFeature): Promise<AiQuotaStatus> {
  const status = await readAiQuotaStatus(profileId);
  if (status.hasByok) return status;

  const bucket = feature === 'chat' ? status.chat : feature === 'assist' ? status.assist : status.smart_replies;
  if (bucket.used >= bucket.limit) {
    throw new HttpsError(
      'resource-exhausted',
      `Daily AI limit reached (${bucket.used}/${bucket.limit}). Add your own API key in Settings or try again tomorrow.`,
    );
  }

  const ref = db.collection('ai_usage').doc(profileId);
  const field = countField(feature);
  const date = todayUtc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const reset = data.date !== date;
    const next = reset ? 1 : Number(data[field] || 0) + 1;
    tx.set(
      ref,
      {
        profile_id: profileId,
        date,
        chat_count: reset ? (field === 'chat_count' ? 1 : 0) : field === 'chat_count' ? next : Number(data.chat_count || 0),
        assist_count: reset ? (field === 'assist_count' ? 1 : 0) : field === 'assist_count' ? next : Number(data.assist_count || 0),
        smart_replies_count:
          reset ? (field === 'smart_replies_count' ? 1 : 0) : field === 'smart_replies_count' ? next : Number(data.smart_replies_count || 0),
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
  });

  return readAiQuotaStatus(profileId);
}
