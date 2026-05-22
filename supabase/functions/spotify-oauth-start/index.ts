import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const REDIRECT_URI = Deno.env.get('SPOTIFY_REDIRECT_URI') || 'https://vybehub.app/spotify/callback';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative user-read-email';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: claims, error } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (error || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const returnTo: string = body.returnTo || 'https://vybehub.app/settings';

    // Generate a single-use nonce and persist it server-side so the callback
    // can verify that the auth user who initiated the flow matches the userId.
    const nonce = crypto.randomUUID();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: nonceErr } = await admin.from('oauth_nonces').insert({
      nonce,
      user_id: userId,
      provider: 'spotify',
      return_to: returnTo,
      redirect_uri: REDIRECT_URI,
    });
    if (nonceErr) {
      return new Response(JSON.stringify({ error: 'Failed to start OAuth flow' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // State carries only the nonce; userId/returnTo are resolved server-side.
    const state = btoa(`${nonce}|${returnTo}|${REDIRECT_URI}`);


    const url = new URL('https://accounts.spotify.com/authorize');
    url.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('show_dialog', 'true');

    return new Response(JSON.stringify({ url: url.toString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
