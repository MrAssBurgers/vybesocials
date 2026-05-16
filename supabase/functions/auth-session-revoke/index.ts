// Revoke a single session (or all sessions) for the authenticated user.
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
} from '../_shared/security.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401);
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';

    const { sessionId, all } = await req.json().catch(() => ({}));
    const admin = getServiceClient();
    const now = new Date().toISOString();

    if (all === true) {
      await admin.from('user_sessions')
        .update({ revoked_at: now })
        .eq('user_id', user.id)
        .is('revoked_at', null);
      // Force sign-out everywhere via Supabase admin API
      try { if (jwt) await admin.auth.admin.signOut(jwt, 'global' as any); } catch {}
      return jsonResponse({ ok: true, revokedAll: true });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return jsonResponse({ error: 'invalid_input' }, 400);
    }
    const { error } = await admin.from('user_sessions')
      .update({ revoked_at: now })
      .eq('id', sessionId)
      .eq('user_id', user.id);
    if (error) return jsonResponse({ error: 'revoke_failed' }, 500);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error('auth-session-revoke error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
