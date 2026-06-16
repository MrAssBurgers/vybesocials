import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

/** AI chat — replace Supabase ai-chat edge function. */
export const aiChat = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const { message, conversationId } = request.data as { message?: string; conversationId?: string };
  if (!message?.trim()) throw new HttpsError('invalid-argument', 'message required');

  // Placeholder — wire Gemini/OpenAI via env secret in production.
  return {
    reply: `VYBE AI (Firebase): received your message${conversationId ? ` in ${conversationId}` : ''}.`,
    conversationId: conversationId || null,
  };
});

/** LiveKit token — replace Supabase livekit-token edge function. */
export const livekitToken = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  return { token: null, error: 'Configure LIVEKIT credentials in Firebase secrets' };
});

/** Push notification sender — replace send-push-notification. */
export const sendPushNotification = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const { userId, title, body } = request.data as { userId?: string; title?: string; body?: string };
  if (!userId) throw new HttpsError('invalid-argument', 'userId required');
  await db.collection('notifications').add({
    user_id: userId,
    title: title || 'VYBE',
    body: body || '',
    created_at: new Date().toISOString(),
    read: false,
  });
  return { ok: true };
});

/** Ranked feed — replace get-ranked-feed RPC. */
export const getRankedFeed = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const limit = Number((request.data as { limit?: number })?.limit || 50);
  const snap = await db.collection('posts').orderBy('created_at', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

/** Share preview — replace share-preview edge function. */
export const sharePreview = onCall(async (request) => {
  const { postId } = request.data as { postId?: string };
  if (!postId) throw new HttpsError('invalid-argument', 'postId required');
  const doc = await db.collection('posts').doc(postId).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Post not found');
  return { post: { id: doc.id, ...doc.data() } };
});

/** Giphy search proxy. */
export const giphySearch = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  return { results: [] };
});

/** Detect AI content. */
export const detectAiContent = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  return { is_ai: false, confidence: 0 };
});
