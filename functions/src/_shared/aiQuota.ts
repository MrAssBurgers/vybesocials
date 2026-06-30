import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin.js';

export type AiFeature = 'chat' | 'assist' | 'smart_replies' | 'image_gen';

export const CHEAP_CHAT_MODEL = 'gemini-2.5-flash-lite';

const LIMITS = {
  free: { chat: 25, assist: 15, smart_replies: 20, image_gen: 5 },
  premium: { chat: 250, assist: 120, smart_replies: 120, image_gen: 40 },
} as const;

const FIELD_BY_FEATURE: Record<AiFeature, string> = {
  chat: 'chat_count',
  assist: 'assist_count',
  smart_replies: 'smart_replies_count',
  image_gen: 'image_gen_count',
};

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
  authUid?: string,
): Promise<string | null> {
  const readKey = async (id: string): Promise<string | null> => {
    const snap = await db.collection('user_ai_keys').doc(`${id}_${provider}`).get();
    if (!snap.exists) return null;
    const data = snap.data() as { api_key?: string; is_active?: boolean };
    if (data.is_active === false) return null;
    const key = typeof data.api_key === 'string' ? data.api_key.trim() : '';
    return key || null;
  };

  const relinkKey = async (fromId: string, key: string): Promise<void> => {
    if (fromId === profileId) return;
    await db.collection('user_ai_keys').doc(`${profileId}_${provider}`).set(
      {
        profile_id: profileId,
        user_id: profileId,
        provider,
        api_key: key,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
  };

  const direct = await readKey(profileId);
  if (direct) return direct;

  if (authUid && authUid !== profileId) {
    const fromAuthUid = await readKey(authUid);
    if (fromAuthUid) {
      await relinkKey(authUid, fromAuthUid);
      return fromAuthUid;
    }
  }

  const prof = await db.collection('profiles').doc(profileId).get();
  const profileAuthUid = prof.data()?.user_id as string | undefined;
  if (profileAuthUid && profileAuthUid !== profileId) {
    const fromAuth = await readKey(profileAuthUid);
    if (fromAuth) {
      await relinkKey(profileAuthUid, fromAuth);
      return fromAuth;
    }
  }

  const idx = await db.collection('user_auth_index').where('profile_id', '==', profileId).limit(1).get();
  if (!idx.empty) {
    const uid = idx.docs[0].id;
    if (uid !== profileId) {
      const fromIndex = await readKey(uid);
      if (fromIndex) {
        await relinkKey(uid, fromIndex);
        return fromIndex;
      }
    }
  }

  return null;
}

export interface AiUsageBucket {
  used: number;
  limit: number;
}

export interface AiQuotaStatus {
  profileId: string;
  isPremium: boolean;
  hasByok: boolean;
  date: string;
  chat: AiUsageBucket;
  assist: AiUsageBucket;
  smart_replies: AiUsageBucket;
  image_gen: AiUsageBucket;
}

function bucketFromUsage(
  usage: Record<string, unknown>,
  field: string,
  limit: number,
  stale: boolean,
): AiUsageBucket {
  return { used: stale ? 0 : Number(usage[field] || 0), limit };
}

export async function readAiQuotaStatus(profileId: string): Promise<AiQuotaStatus> {
  const [premium, byokGoogle, byokOpenai, usageSnap] = await Promise.all([
    isPremiumProfile(profileId),
    getUserAiApiKey(profileId, 'google'),
    getUserAiApiKey(profileId, 'openai'),
    db.collection('ai_usage').doc(profileId).get(),
  ]);

  const limits = premium ? LIMITS.premium : LIMITS.free;
  const usage = (usageSnap.data() || {}) as Record<string, unknown>;
  const date = todayUtc();
  const stale = usage.date !== date;

  return {
    profileId,
    isPremium: premium,
    hasByok: !!(byokGoogle || byokOpenai),
    date,
    chat: bucketFromUsage(usage, 'chat_count', limits.chat, stale),
    assist: bucketFromUsage(usage, 'assist_count', limits.assist, stale),
    smart_replies: bucketFromUsage(usage, 'smart_replies_count', limits.smart_replies, stale),
    image_gen: bucketFromUsage(usage, 'image_gen_count', limits.image_gen, stale),
  };
}

function featureLabel(feature: AiFeature): string {
  if (feature === 'image_gen') return 'image generation';
  if (feature === 'assist') return 'DM assist';
  if (feature === 'smart_replies') return 'smart replies';
  return 'chat';
}

/** Throws resource-exhausted when over daily limit (skipped when user BYOK is active). */
export async function enforceAiQuota(
  profileId: string,
  feature: AiFeature,
  options?: { ignoreByok?: boolean },
): Promise<AiQuotaStatus> {
  const status = await readAiQuotaStatus(profileId);
  if (status.hasByok && !options?.ignoreByok) return status;

  const bucket =
    feature === 'chat' ? status.chat
    : feature === 'assist' ? status.assist
    : feature === 'image_gen' ? status.image_gen
    : status.smart_replies;

  if (bucket.used >= bucket.limit) {
    throw new HttpsError(
      'resource-exhausted',
      `Daily ${featureLabel(feature)} limit reached (${bucket.used}/${bucket.limit}). Add your Google AI key in Settings → VYBE AI or try again tomorrow.`,
    );
  }

  const ref = db.collection('ai_usage').doc(profileId);
  const field = FIELD_BY_FEATURE[feature];
  const date = todayUtc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() || {}) as Record<string, number | string>;
    const reset = data.date !== date;
    const counts: Record<string, number> = {
      chat_count: reset ? 0 : Number(data.chat_count || 0),
      assist_count: reset ? 0 : Number(data.assist_count || 0),
      smart_replies_count: reset ? 0 : Number(data.smart_replies_count || 0),
      image_gen_count: reset ? 0 : Number(data.image_gen_count || 0),
    };
    counts[field] = (reset ? 0 : counts[field]) + 1;
    tx.set(
      ref,
      {
        profile_id: profileId,
        date,
        ...counts,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
  });

  return readAiQuotaStatus(profileId);
}
