import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;

const REQUIRED_SCOPE = 'playlist-read-private';

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function refreshToken(admin: any, userId: string, refresh_token: string) {
  const basic = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || 'Refresh failed');
  const newAccess = j.access_token as string;
  const newRefresh = (j.refresh_token as string) || refresh_token;
  const newScope = (j.scope as string) || null;
  await admin.from('spotify_connections').update({
    access_token: newAccess,
    refresh_token: newRefresh,
    token_expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(),
    ...(newScope ? { scope: newScope } : {}),
  }).eq('user_id', userId);
  return { access_token: newAccess, scope: newScope };
}

async function ensureFreshToken(admin: any, userId: string, conn: any): Promise<string> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return conn.access_token;
  const { access_token } = await refreshToken(admin, userId, conn.refresh_token);
  return access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return ok({ error: 'Unauthorized', playlists: [] }, 401);
    }

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !userData?.user) {
      return ok({ error: 'Unauthorized', playlists: [] }, 401);
    }
    const userId = userData.user.id;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: conn } = await admin.from('spotify_connections').select('*').eq('user_id', userId).maybeSingle();
    if (!conn) {
      return ok({ needs_connect: true, playlists: [] });
    }

    // Note: we no longer pre-block based on stored scope string — old connections
    // may have a stale `scope` value. Try Spotify first and only require reconnect
    // if Spotify itself rejects the request.

    let accessToken: string;
    try {
      accessToken = await ensureFreshToken(admin, userId, conn);
    } catch (_) {
      return ok({ needs_reconnect: true, reason: 'refresh_failed', playlists: [] });
    }

    const doFetch = (token: string) => fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    let r = await doFetch(accessToken);

    if (r.status === 401) {
      try {
        const refreshed = await refreshToken(admin, userId, conn.refresh_token);
        if (refreshed.scope && !refreshed.scope.split(/\s+/).includes(REQUIRED_SCOPE)) {
          return ok({ needs_reconnect: true, reason: 'missing_scope', playlists: [] });
        }
        accessToken = refreshed.access_token;
        r = await doFetch(accessToken);
      } catch (_) {
        return ok({ needs_reconnect: true, reason: 'refresh_failed', playlists: [] });
      }
      if (r.status === 401) {
        return ok({ needs_reconnect: true, reason: 'token_invalid', playlists: [] });
      }
    }

    if (!r.ok) {
      const txt = await r.text();
      return ok({ error: `Spotify error ${r.status}`, detail: txt.slice(0, 300), playlists: [] });
    }
    const j = await r.json();
    const playlists = (j.items || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url || null,
      tracks: p.tracks?.total ?? 0,
      owner: p.owner?.display_name || '',
    }));

    return new Response(JSON.stringify({ playlists }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
    });
  } catch (e) {
    return ok({ error: (e as Error).message, playlists: [] }, 200);
  }
});
