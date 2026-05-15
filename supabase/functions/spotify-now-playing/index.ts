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
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: claims, error } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (error || !claims?.claims) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const userId = claims.claims.sub as string;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: conn } = await admin.from('spotify_connections').select('*').eq('user_id', userId).maybeSingle();
    if (!conn) return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const accessToken = await refreshIfNeeded(admin, userId, conn);

    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    // 204 = no active playback
    let payload: any = { provider: 'spotify', is_playing: false, track_id: null, title: null, artist: null, album: null, album_art_url: null, duration_ms: null, progress_ms: null, track_url: null };
    if (r.status === 200) {
      const j = await r.json();
      const item = j.item;
      if (item) {
        payload = {
          provider: 'spotify',
          is_playing: !!j.is_playing,
          track_id: item.id,
          title: item.name,
          artist: (item.artists || []).map((a: any) => a.name).join(', '),
          album: item.album?.name || null,
          album_art_url: item.album?.images?.[0]?.url || null,
          duration_ms: item.duration_ms || null,
          progress_ms: j.progress_ms || 0,
          track_url: item.external_urls?.spotify || null,
        };
      }
    } else if (r.status === 401) {
      return new Response(JSON.stringify({ error: 'token_invalid' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else if (r.status === 429) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Upsert presence (service role bypasses RLS; user_id matches verified auth uid)
    await admin.from('live_music_presence').upsert({ user_id: userId, ...payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    return new Response(JSON.stringify({ connected: true, ...payload }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
