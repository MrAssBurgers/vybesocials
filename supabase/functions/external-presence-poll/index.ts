// Polls Twitch (is the user live?) and Steam (is the user in a game?) for
// the calling auth user, then upserts/clears their live_music_presence row.
// Uses the Twitch connector gateway (no Twitch creds in this project) and
// the public Steam Web API (requires STEAM_API_KEY).
//
// Auth: requires a valid Supabase JWT in Authorization.
// Frequency: client should call every ~30s while the tab is active.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const TWITCH_GATEWAY = 'https://connector-gateway.lovable.dev/twitch';

interface PresenceRow {
  user_id: string;
  provider: 'twitch' | 'steam';
  track_id: string | null;
  title: string | null;
  artist: string | null;
  album_art_url: string | null;
  track_url: string | null;
  is_playing: boolean;
}

async function fetchTwitch(login: string): Promise<PresenceRow | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWITCH_API_KEY = Deno.env.get('TWITCH_API_KEY');
  if (!LOVABLE_API_KEY || !TWITCH_API_KEY) return null;

  const res = await fetch(`${TWITCH_GATEWAY}/streams?user_login=${encodeURIComponent(login)}`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TWITCH_API_KEY,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const stream = data?.data?.[0];
  if (!stream) return null; // not live
  return {
    user_id: '', // filled below
    provider: 'twitch',
    track_id: String(stream.id),
    title: stream.title || stream.game_name || 'Live on Twitch',
    artist: stream.game_name || stream.user_name,
    album_art_url: (stream.thumbnail_url as string | undefined)
      ?.replace('{width}', '320')
      .replace('{height}', '180') ?? null,
    track_url: `https://twitch.tv/${login}`,
    is_playing: true,
  };
}

async function fetchSteam(steamId: string): Promise<PresenceRow | null> {
  const STEAM_API_KEY = Deno.env.get('STEAM_API_KEY');
  if (!STEAM_API_KEY) return null;

  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${encodeURIComponent(steamId)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const p = data?.response?.players?.[0];
  if (!p?.gameextrainfo) return null; // not in a game
  const appId = p.gameid;
  return {
    user_id: '',
    provider: 'steam',
    track_id: appId ? String(appId) : null,
    title: p.gameextrainfo,
    artist: p.personaname || 'Playing on Steam',
    album_art_url: appId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg` : null,
    track_url: appId ? `steam://run/${appId}` : (p.profileurl ?? null),
    is_playing: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // Verify caller
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    // Service client for writes
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Look up handles
    const { data: handles } = await admin
      .from('external_account_handles')
      .select('twitch_login, steam_id')
      .eq('user_id', userId)
      .maybeSingle();

    // Check current presence — only manage rows we own (twitch/steam).
    // Never clobber a spotify/apple/youtube row from this function.
    const { data: current } = await admin
      .from('live_music_presence')
      .select('provider, track_id, is_playing')
      .eq('user_id', userId)
      .maybeSingle();

    let next: PresenceRow | null = null;

    // Twitch takes precedence over Steam (live streaming > playing a game)
    if (handles?.twitch_login) {
      next = await fetchTwitch(handles.twitch_login);
    }
    if (!next && handles?.steam_id) {
      next = await fetchSteam(handles.steam_id);
    }

    if (next) {
      next.user_id = userId;
      // Don't overwrite spotify/apple/youtube — they take priority if currently playing
      if (current?.is_playing && (current.provider === 'spotify' || current.provider === 'apple_music' || current.provider === 'youtube')) {
        return new Response(JSON.stringify({ skipped: 'higher-priority provider active', current }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await admin.from('live_music_presence').upsert(next, { onConflict: 'user_id' });
      return new Response(JSON.stringify({ presence: next }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Nothing live now — clear ONLY if the existing row is twitch/steam
    if (current && (current.provider === 'twitch' || current.provider === 'steam')) {
      await admin.from('live_music_presence').delete().eq('user_id', userId);
    }
    return new Response(JSON.stringify({ presence: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('external-presence-poll error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
