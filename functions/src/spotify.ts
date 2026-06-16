/**
 * Spotify OAuth + control. Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET.
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, auth } from './_shared/admin.js';

const SECRETS = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];
const REDIRECT_URI = () => `${process.env.PUBLIC_SITE_URL || 'https://vybehub.app'}/api/spotify-oauth-callback`;
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private user-read-email';

function clientId() {
  const v = process.env.SPOTIFY_CLIENT_ID;
  if (!v) throw new HttpsError('failed-precondition', 'SPOTIFY_CLIENT_ID missing');
  return v;
}
function clientSecret() {
  const v = process.env.SPOTIFY_CLIENT_SECRET;
  if (!v) throw new HttpsError('failed-precondition', 'SPOTIFY_CLIENT_SECRET missing');
  return v;
}

async function refreshIfNeeded(uid: string): Promise<string> {
  const ref = db.collection('spotify_connections').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Spotify not connected');
  const data = snap.data() as any;
  if (data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.access_token;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }),
  });
  if (!res.ok) throw new HttpsError('internal', `Refresh failed: ${await res.text()}`);
  const tok = await res.json();
  await ref.update({
    access_token: tok.access_token,
    expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
  });
  return tok.access_token;
}

export const spotifyOauthStart = onRequest({ secrets: SECRETS }, async (req, res) => {
  const uid = String(req.query.uid || '');
  if (!uid) { res.status(400).send('uid required'); return; }
  const state = Buffer.from(JSON.stringify({ uid, t: Date.now() })).toString('base64url');
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI());
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

export const spotifyOauthCallback = onRequest({ secrets: SECRETS }, async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if (!code || !state) { res.status(400).send('Missing code/state'); return; }
  let uid: string;
  try {
    uid = JSON.parse(Buffer.from(state, 'base64url').toString()).uid;
    await auth.getUser(uid);
  } catch {
    res.status(400).send('Bad state');
    return;
  }
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI() }),
  });
  if (!tokenRes.ok) { res.status(500).send(`Token exchange failed: ${await tokenRes.text()}`); return; }
  const tok = await tokenRes.json();
  const meRes = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const me = meRes.ok ? await meRes.json() : {};
  await db.collection('spotify_connections').doc(uid).set({
    user_id: uid, spotify_user_id: me.id, display_name: me.display_name, email: me.email,
    access_token: tok.access_token, refresh_token: tok.refresh_token,
    expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    scope: tok.scope, connected_at: new Date().toISOString(),
  }, { merge: true });
  res.redirect(`${process.env.PUBLIC_SITE_URL || 'https://vybehub.app'}/settings/integrations?spotify=connected`);
});

export const spotifyDisconnect = onCall(async (request) => {
  const uid = requireAuth(request);
  await db.collection('spotify_connections').doc(uid).delete();
  return { ok: true };
});

export const spotifyNowPlaying = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const token = await refreshIfNeeded(uid);
  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return { ok: true, playing: false };
  if (!res.ok) throw new HttpsError('internal', `Spotify ${res.status}`);
  return { ok: true, playing: true, data: await res.json() };
});

export const spotifyControl = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const { action, uri } = (request.data || {}) as any;
  const token = await refreshIfNeeded(uid);
  const base = 'https://api.spotify.com/v1/me/player';
  let url = '', method = 'PUT', body: string | undefined;
  switch (action) {
    case 'play': url = `${base}/play`; body = uri ? JSON.stringify({ uris: [uri] }) : undefined; break;
    case 'pause': url = `${base}/pause`; break;
    case 'next': url = `${base}/next`; method = 'POST'; break;
    case 'previous': url = `${base}/previous`; method = 'POST'; break;
    default: throw new HttpsError('invalid-argument', 'unknown action');
  }
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
  if (!res.ok && res.status !== 204) throw new HttpsError('internal', `Spotify ${res.status}`);
  return { ok: true };
});

export const spotifyPlaylists = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const token = await refreshIfNeeded(uid);
  const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpsError('internal', `Spotify ${res.status}`);
  return { ok: true, ...(await res.json()) };
});

export const spotifyListenAlong = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const { friend_id } = (request.data || {}) as any;
  if (!friend_id) throw new HttpsError('invalid-argument', 'friend_id required');
  const friendConn = await db.collection('spotify_connections').doc(friend_id).get();
  if (!friendConn.exists) return { ok: false, error: 'friend_not_connected' };
  const friendToken = await refreshIfNeeded(friend_id);
  const np = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: `Bearer ${friendToken}` } });
  if (np.status === 204) return { ok: true, listening: false };
  const data = await np.json();
  const uri = data?.item?.uri;
  if (!uri) return { ok: true, listening: false };
  const myToken = await refreshIfNeeded(uid);
  await fetch('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT', headers: { Authorization: `Bearer ${myToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri], position_ms: data.progress_ms || 0 }),
  });
  return { ok: true, listening: true, track: data.item };
});
