import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;

async function refreshIfNeeded(admin: any, userId: string, conn: any): Promise<string> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return conn.access_token;
  const basic = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || 'Refresh failed');
  const newAccess = j.access_token as string;
  const newRefresh = (j.refresh_token as string) || conn.refresh_token;
  await admin.from('spotify_connections').update({
    access_token: newAccess,
    refresh_token: newRefresh,
    token_expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(),
  }).eq('user_id', userId);
  return newAccess;
}

function interpretStatus(status: number) {
  if (status === 204 || status === 202 || status === 200) return { ok: true };
  if (status === 404) return { no_device: true };
  if (status === 403) return { premium_required: true };
  if (status === 401) return { needs_reconnect: true };
  return null;
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

    const validActions = ['play', 'pause', 'next', 'previous', 'seek', 'start_playlist', 'start_track'];
    if (!validActions.includes(action)) {
      return new Response(JSON.stringify({ error: 'invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    const accessToken = await refreshIfNeeded(admin, userId, conn);
    const auth = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    let r: Response;
    switch (action) {
      case 'play':
        r = await fetch('https://api.spotify.com/v1/me/player/play', { method: 'PUT', headers: auth });
        break;
      case 'pause':
        r = await fetch('https://api.spotify.com/v1/me/player/pause', { method: 'PUT', headers: auth });
        break;
      case 'next':
        r = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers: auth });
        break;
      case 'previous':
        r = await fetch('https://api.spotify.com/v1/me/player/previous', { method: 'POST', headers: auth });
        break;
      case 'seek':
        if (positionMs === null) {
          return new Response(JSON.stringify({ error: 'position_ms required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        r = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}`, { method: 'PUT', headers: auth });
        break;
      case 'start_playlist':
        if (!playlistId) {
          return new Response(JSON.stringify({ error: 'playlist_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        r = await fetch('https://api.spotify.com/v1/me/player/play', {
          method: 'PUT',
          headers: auth,
          body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
        });
        break;
      case 'start_track':
        if (!trackId) {
          return new Response(JSON.stringify({ error: 'track_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        r = await fetch('https://api.spotify.com/v1/me/player/play', {
          method: 'PUT',
          headers: auth,
          body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: positionMs ?? 0 }),
        });
        break;
      default:
        return new Response(JSON.stringify({ error: 'unreachable' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = interpretStatus(r.status);
    if (result) {
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const txt = await r.text();
    return new Response(JSON.stringify({ error: `Spotify error ${r.status}`, detail: txt }), { status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
