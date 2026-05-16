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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const trackId = String(body?.track_id || '').trim();
    const positionMs = Math.max(0, Number(body?.position_ms || 0));
    if (!trackId) {
      return new Response(JSON.stringify({ error: 'track_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: claims, error } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (error || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: conn } = await admin.from('spotify_connections').select('*').eq('user_id', userId).maybeSingle();
    if (!conn) {
      return new Response(JSON.stringify({ needs_connect: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const accessToken = await refreshIfNeeded(admin, userId, conn);

    const r = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: positionMs }),
    });

    if (r.status === 204) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (r.status === 404) {
      // No active device
      return new Response(JSON.stringify({ no_device: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (r.status === 403) {
      // Premium required
      const txt = await r.text();
      return new Response(JSON.stringify({ error: 'Spotify Premium required for playback control', detail: txt }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const txt = await r.text();
    return new Response(JSON.stringify({ error: `Spotify error ${r.status}`, detail: txt }), { status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
