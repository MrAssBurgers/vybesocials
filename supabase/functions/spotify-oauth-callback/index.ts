import { createClient } from 'npm:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const FALLBACK_REDIRECT_URI = Deno.env.get('SPOTIFY_REDIRECT_URI') || 'https://vybehub.app/spotify/callback';

const redirect = (returnTo: string, params: Record<string, string>) => {
  const u = new URL(returnTo);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  let returnTo = 'https://vybehub.app/settings';
  let userId: string | null = null;
  let redirectUri = FALLBACK_REDIRECT_URI;
  try {
    if (state) {
      const [uid, , rt, ru] = atob(state).split('|');
      userId = uid;
      if (rt) returnTo = rt;
      if (ru?.startsWith('https://')) redirectUri = ru;
    }
  } catch { /* ignore */ }

  if (errorParam) {
    return redirect(returnTo, { spotify: 'error', reason: errorParam });
  }
  if (!code || !userId) {
    return redirect(returnTo, { spotify: 'error', reason: 'missing_code' });
  }

  try {
    // Exchange code for tokens
    const basic = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenJson.error_description || tokenJson.error || 'Token exchange failed');

    const accessToken: string = tokenJson.access_token;
    const refreshToken: string = tokenJson.refresh_token;
    const expiresIn: number = tokenJson.expires_in;
    const scope: string = tokenJson.scope;

    // Fetch Spotify profile
    const meRes = await fetch('https://api.spotify.com/v1/me', { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const me = await meRes.json();
    if (!meRes.ok) throw new Error(me.error?.message || 'Profile fetch failed');

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: upErr } = await admin.from('spotify_connections').upsert({
      user_id: userId,
      spotify_user_id: me.id,
      display_name: me.display_name || me.id,
      email: me.email || null,
      avatar_url: me.images?.[0]?.url || null,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scope,
    }, { onConflict: 'user_id' });
    if (upErr) throw upErr;

    // Ensure music_settings row exists
    await admin.from('music_settings').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });

    return redirect(returnTo, { spotify: 'connected' });
  } catch (e) {
    return redirect(returnTo, { spotify: 'error', reason: (e as Error).message.slice(0, 120) });
  }
});
