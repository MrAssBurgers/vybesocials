import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

initializeApp();
const db = getFirestore();
const auth = getAuth();

// ---------- helpers ----------
async function requireAuth(request: { auth?: { uid: string } | null }) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  return request.auth.uid;
}

async function requireAdmin(request: { auth?: { uid: string; token?: Record<string, unknown> } | null }) {
  const uid = await requireAuth(request);
  if (!request.auth?.token?.admin) {
    // Fallback: check user_roles collection
    const snap = await db.collection('user_roles')
      .where('user_id', '==', uid)
      .where('role', '==', 'admin')
      .limit(1).get();
    if (snap.empty) throw new HttpsError('permission-denied', 'Admin only');
  }
  return uid;
}

// ---------- admin claim sync ----------
/**
 * Promote a user to admin. Caller must already be admin (bootstrap the first
 * admin manually via the Firebase Console → Auth → Custom Claims).
 */
export const setAdminClaim = onCall(async (request) => {
  await requireAdmin(request);
  const { userId, admin } = request.data as { userId?: string; admin?: boolean };
  if (!userId) throw new HttpsError('invalid-argument', 'userId required');
  const current = (await auth.getUser(userId)).customClaims || {};
  await auth.setCustomUserClaims(userId, { ...current, admin: !!admin });
  await db.collection('user_roles').doc(`${userId}_admin`).set({
    user_id: userId, role: 'admin', enabled: !!admin, updated_at: new Date().toISOString(),
  }, { merge: true });
  return { ok: true };
});

// ---------- AI ----------
/** AI chat — replace Supabase ai-chat edge function. */
export const aiChat = onCall(async (request) => {
  await requireAuth(request);
  const { message, conversationId } = request.data as { message?: string; conversationId?: string };
  if (!message?.trim()) throw new HttpsError('invalid-argument', 'message required');
  // TODO: wire LOVABLE_API_KEY / GEMINI_API_KEY via Firebase secrets in Phase 5.
  return {
    reply: `VYBE AI (Firebase): received your message${conversationId ? ` in ${conversationId}` : ''}.`,
    conversationId: conversationId || null,
  };
});

/** LiveKit token — replace Supabase livekit-token edge function. */
export const livekitToken = onCall(async (request) => {
  await requireAuth(request);
  return { token: null, error: 'Configure LIVEKIT credentials in Firebase secrets' };
});

/** Push notification sender — replace send-push-notification. */
export const sendPushNotification = onCall(async (request) => {
  await requireAuth(request);
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
  await requireAuth(request);
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
  await requireAuth(request);
  return { results: [] };
});

/** Detect AI content. */
export const detectAiContent = onCall(async (request) => {
  await requireAuth(request);
  return { is_ai: false, confidence: 0 };
});
