import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;

const REQUIRED_SCOPE = 'user-modify-playback-state';

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

function interpretStatus(status: number) {
  if (status === 204 || status === 202 || status === 200) return { ok: true };
  if (status === 404) return { no_device: true };
  if (status === 403) return { premium_required: true };
  return null;
}

function buildRequest(action: string, params: { positionMs: number | null; playlistId: string | null; trackId: string | null; shuffleState: boolean | null }) {
  switch (action) {
    case 'play': return { url: 'https://api.spotify.com/v1/me/player/play', method: 'PUT', body: undefined };
    case 'pause': return { url: 'https://api.spotify.com/v1/me/player/pause', method: 'PUT', body: undefined };
    case 'next': return { url: 'https://api.spotify.com/v1/me/player/next', method: 'POST', body: undefined };
    case 'previous': return { url: 'https://api.spotify.com/v1/me/player/previous', method: 'POST', body: undefined };
    case 'seek': return { url: `https://api.spotify.com/v1/me/player/seek?position_ms=${params.positionMs ?? 0}`, method: 'PUT', body: undefined };
    case 'shuffle': return { url: `https://api.spotify.com/v1/me/player/shuffle?state=${params.shuffleState ? 'true' : 'false'}`, method: 'PUT', body: undefined };
    case 'start_playlist': return { url: 'https://api.spotify.com/v1/me/player/play', method: 'PUT', body: JSON.stringify({ context_uri: `spotify:playlist:${params.playlistId}` }) };
    case 'start_track': return { url: 'https://api.spotify.com/v1/me/player/play', method: 'PUT', body: JSON.stringify({ uris: [`spotify:track:${params.trackId}`], position_ms: params.positionMs ?? 0 }) };
    default: return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const positionMs = Number.isFinite(body?.position_ms) ? Math.max(0, Number(body.position_ms)) : null;
    const playlistId = body?.playlist_id ? String(body.playlist_id) : null;
    const trackId = body?.track_id ? String(body.track_id) : null;
    const shuffleState = typeof body?.state === 'boolean' ? body.state : null;

    const req_ = buildRequest(action, { positionMs, playlistId, trackId, shuffleState });
    if (!req_) {
      return new Response(JSON.stringify({ error: 'invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'start_playlist' && !playlistId) {
      return new Response(JSON.stringify({ error: 'playlist_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'start_track' && !trackId) {
      return new Response(JSON.stringify({ error: 'track_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: error?.message }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: conn } = await admin.from('spotify_connections').select('*').eq('user_id', userId).maybeSingle();
    if (!conn) {
      return new Response(JSON.stringify({ needs_connect: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Note: we don't pre-block on stored scope — old connections may have a stale
    // scope string. Try Spotify and only ask for reconnect on a real 401.

    let accessToken: string;
    try {
      accessToken = await ensureFreshToken(admin, userId, conn);
    } catch (_) {
      return new Response(JSON.stringify({ needs_reconnect: true, reason: 'refresh_failed' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const doFetch = (token: string) => fetch(req_.url, {
      method: req_.method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: req_.body,
    });

    let r = await doFetch(accessToken);

    // On 401, force a refresh and retry once (token may be stale)
    if (r.status === 401) {
      try {
        const refreshed = await refreshToken(admin, userId, conn.refresh_token);
        if (refreshed.scope && !refreshed.scope.split(/\s+/).includes(REQUIRED_SCOPE)) {
          return new Response(JSON.stringify({ needs_reconnect: true, reason: 'missing_scope' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        accessToken = refreshed.access_token;
        r = await doFetch(accessToken);
      } catch (_) {
        return new Response(JSON.stringify({ needs_reconnect: true, reason: 'refresh_failed' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (r.status === 401) {
        return new Response(JSON.stringify({ needs_reconnect: true, reason: 'token_invalid' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const result = interpretStatus(r.status);
    if (result) {
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const txt = await r.text();
    return new Response(JSON.stringify({ error: `Spotify error ${r.status}`, detail: txt.slice(0, 300) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
