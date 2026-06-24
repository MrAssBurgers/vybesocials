import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
import {
  getUserAiApiKey,
  readAiQuotaStatus,
  resolveProfileIdFromAuth,
} from './_shared/aiQuota.js';

const PROVIDERS = new Set(['google', 'openai']);

function normalizeProvider(raw: unknown): 'google' | 'openai' {
  const p = String(raw || 'google').toLowerCase();
  if (p === 'openai') return 'openai';
  return 'google';
}

function looksLikeApiKey(provider: 'google' | 'openai', key: string): boolean {
  if (key.length < 20 || key.length > 256) return false;
  if (provider === 'openai') return key.startsWith('sk-');
  return key.startsWith('AIza') || key.startsWith('AQ.') || key.length >= 30;
}

/** Daily usage + BYOK flags (no secrets). */
export const getAiUsage = onCall(async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileIdFromAuth(authUid);
  const status = await readAiQuotaStatus(profileId);
  return {
    ok: true,
    ...status,
    providers: {
      google: !!(await getUserAiApiKey(profileId, 'google')),
      openai: !!(await getUserAiApiKey(profileId, 'openai')),
    },
  };
});

/** Save user's own provider API key — billed to them, not counted against VYBE quota. */
export const saveUserAiKey = onCall(async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileIdFromAuth(authUid);
  const { provider: rawProvider, apiKey } = (request.data || {}) as {
    provider?: string;
    apiKey?: string;
  };

  const provider = normalizeProvider(rawProvider);
  if (!PROVIDERS.has(provider)) throw new HttpsError('invalid-argument', 'Unsupported provider');

  const key = String(apiKey || '').trim();
  if (!key) throw new HttpsError('invalid-argument', 'apiKey required');
  if (!looksLikeApiKey(provider, key)) {
    throw new HttpsError('invalid-argument', 'That API key format does not look valid');
  }

  await db.collection('user_ai_keys').doc(`${profileId}_${provider}`).set({
    profile_id: profileId,
    user_id: profileId,
    provider,
    api_key: key,
    is_active: true,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }, { merge: true });

  return { ok: true, provider, hasKey: true };
});

/** Remove stored BYOK key. */
export const deleteUserAiKey = onCall(async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileIdFromAuth(authUid);
  const provider = normalizeProvider((request.data as { provider?: string })?.provider);
  await db.collection('user_ai_keys').doc(`${profileId}_${provider}`).delete();
  return { ok: true };
});
