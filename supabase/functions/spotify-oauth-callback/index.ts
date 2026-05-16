import { createClient } from 'npm:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const FALLBACK_REDIRECT_URI = Deno.env.get('SPOTIFY_REDIRECT_URI') || 'https://vybehub.app/spotify/callback';

const html = (msg: string, returnTo: string, ok: boolean) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Spotify</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;background:#0B0B10;color:#fff;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
  .card{max-width:380px}
  .ico{width:64px;height:64px;border-radius:50%;background:${ok ? '#1DB954' : '#ef4444'};margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:32px}
  h1{font-size:22px;margin:0 0 8px}
  p{color:#9ca3af;margin:0 0 24px;font-size:14px}
  a{display:inline-block;background:#8B5CF6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600}
</style></head>
<body><div class="card">
  <div class="ico">${ok ? '✓' : '!'}</div>
  <h1>${ok ? 'Spotify connected' : 'Connection failed'}</h1>
  <p>${msg}</p>
  <a href="${returnTo}">Return to Vybe</a>
</div>
<script>setTimeout(()=>{location.href=${JSON.stringify(returnTo)}}, 1500)</script>
</body></html>`;

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
    return new Response(html(`Spotify said: ${errorParam}`, returnTo, false), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (!code || !userId) {
    return new Response(html('Missing code or state.', returnTo, false), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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

    return new Response(html(`Connected as ${me.display_name || me.id}.`, returnTo, true), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return new Response(html((e as Error).message, returnTo, false), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
});
