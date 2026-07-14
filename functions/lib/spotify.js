/**
 * Spotify OAuth + control. Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET.
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, auth } from './_shared/admin.js';
const SECRETS = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];
const SITE_URL = () => process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
/** Must match Spotify Developer Dashboard → Redirect URIs */
const REDIRECT_URI = () => `${SITE_URL()}/spotify/callback`;
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private user-read-email';
function clientId() {
    const v = process.env.SPOTIFY_CLIENT_ID;
    if (!v)
        throw new HttpsError('failed-precondition', 'SPOTIFY_CLIENT_ID missing');
    return v;
}
function clientSecret() {
    const v = process.env.SPOTIFY_CLIENT_SECRET;
    if (!v)
        throw new HttpsError('failed-precondition', 'SPOTIFY_CLIENT_SECRET missing');
    return v;
}
async function refreshIfNeeded(uid) {
    const ref = db.collection('spotify_connections').doc(uid);
    const snap = await ref.get();
    if (!snap.exists)
        throw new HttpsError('failed-precondition', 'Spotify not connected');
    const data = snap.data();
    if (data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000)
        return data.access_token;
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }),
    });
    if (!res.ok)
        throw new HttpsError('internal', `Refresh failed: ${await res.text()}`);
    const tok = await res.json();
    await ref.update({
        access_token: tok.access_token,
        expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    });
    return tok.access_token;
}
import crypto from 'node:crypto';
function stateSecret() {
    return process.env.SPOTIFY_STATE_SECRET
        || process.env.UNSUBSCRIBE_SECRET
        || `${clientId()}:${clientSecret()}`;
}
function signState(uid) {
    const payload = { uid, t: Date.now(), n: crypto.randomBytes(8).toString('hex') };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
    return `${body}.${sig}`;
}
function verifyState(state) {
    const [body, sig] = state.split('.');
    if (!body || !sig)
        throw new Error('bad state');
    const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
        throw new Error('bad sig');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.uid || typeof payload.uid !== 'string')
        throw new Error('bad uid');
    if (Date.now() - Number(payload.t || 0) > 10 * 60 * 1000)
        throw new Error('expired');
    return payload;
}
/** Callable: authenticated caller receives a signed authorization URL bound to their uid. */
export const createSpotifyOauthUrl = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const state = signState(uid);
    const url = new URL('https://accounts.spotify.com/authorize');
    url.searchParams.set('client_id', clientId());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', REDIRECT_URI());
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    return { url: url.toString() };
});
/** HTTP entry retained for compatibility — requires a Firebase ID token as `?token=` or Authorization header. */
export const spotifyOauthStart = onRequest({ secrets: SECRETS }, async (req, res) => {
    const authHeader = String(req.headers.authorization || '');
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const idToken = bearer || String(req.query.token || '');
    if (!idToken) {
        res.status(401).send('authentication required');
        return;
    }
    let uid;
    try {
        const decoded = await auth.verifyIdToken(idToken);
        uid = decoded.uid;
    }
    catch {
        res.status(401).send('invalid token');
        return;
    }
    const state = signState(uid);
    const url = new URL('https://accounts.spotify.com/authorize');
    url.searchParams.set('client_id', clientId());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', REDIRECT_URI());
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    res.redirect(url.toString());
});
export const spotifyOauthCallback = onRequest({ secrets: SECRETS }, async (req, res) => {
    const oauthError = String(req.query.error || '');
    if (oauthError) {
        res.redirect(`${SITE_URL()}/settings?tab=connections&spotify=error&reason=${encodeURIComponent(oauthError)}`);
        return;
    }
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code || !state) {
        res.status(400).send('Missing code/state');
        return;
    }
    let uid;
    try {
        uid = verifyState(state).uid;
        await auth.getUser(uid);
    }
    catch {
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
    if (!tokenRes.ok) {
        res.status(500).send(`Token exchange failed: ${await tokenRes.text()}`);
        return;
    }
    const tok = await tokenRes.json();
    const meRes = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const me = meRes.ok ? await meRes.json() : {};
    await db.collection('spotify_connections').doc(uid).set({
        user_id: uid, spotify_user_id: me.id, display_name: me.display_name, email: me.email,
        access_token: tok.access_token, refresh_token: tok.refresh_token,
        expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
        scope: tok.scope, connected_at: new Date().toISOString(),
    }, { merge: true });
    res.redirect(`${SITE_URL()}/settings?tab=connections&spotify=connected`);
});
export const spotifyDisconnect = onCall(async (request) => {
    const uid = requireAuth(request);
    await db.collection('spotify_connections').doc(uid).delete();
    return { ok: true };
});
async function findSpotifyConnection(uid) {
    const direct = await db.collection('spotify_connections').doc(uid).get();
    if (direct.exists)
        return { id: direct.id, data: direct.data() };
    const byUser = await db.collection('spotify_connections').where('user_id', '==', uid).limit(1).get();
    if (!byUser.empty) {
        const doc = byUser.docs[0];
        return { id: doc.id, data: doc.data() };
    }
    return null;
}
function emptyNowPlaying() {
    return {
        provider: 'spotify',
        is_playing: false,
        track_id: null,
        title: null,
        artist: null,
        album: null,
        album_art_url: null,
        duration_ms: null,
        progress_ms: null,
        track_url: null,
        tempo: null,
        energy: null,
    };
}
/** Poll Spotify + upsert `live_music_presence` (matches legacy Supabase edge fn). */
export const spotifyNowPlaying = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const conn = await findSpotifyConnection(uid);
    if (!conn)
        return { connected: false };
    const token = await refreshIfNeeded(conn.id);
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${token}` },
    });
    let payload = emptyNowPlaying();
    if (res.status === 200) {
        const j = await res.json();
        const item = j.item;
        if (item) {
            payload = {
                provider: 'spotify',
                is_playing: !!j.is_playing,
                track_id: item.id ?? null,
                title: item.name ?? null,
                artist: (item.artists || []).map((a) => a.name).join(', ') || null,
                album: item.album?.name ?? null,
                album_art_url: item.album?.images?.[0]?.url ?? null,
                duration_ms: item.duration_ms ?? null,
                progress_ms: j.progress_ms ?? 0,
                track_url: item.external_urls?.spotify ?? null,
                tempo: null,
                energy: null,
            };
            if (item.id) {
                try {
                    const fr = await fetch(`https://api.spotify.com/v1/audio-features/${item.id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (fr.ok) {
                        const fj = await fr.json();
                        payload.tempo = typeof fj.tempo === 'number' ? fj.tempo : null;
                        payload.energy = typeof fj.energy === 'number' ? fj.energy : null;
                    }
                }
                catch { /* best effort */ }
            }
        }
    }
    else if (res.status === 401) {
        throw new HttpsError('unauthenticated', 'token_invalid');
    }
    else if (res.status === 429) {
        throw new HttpsError('resource-exhausted', 'rate_limited');
    }
    else if (res.status !== 204) {
        throw new HttpsError('internal', `Spotify ${res.status}`);
    }
    await db.collection('live_music_presence').doc(uid).set({
        user_id: uid,
        ...payload,
        updated_at: new Date().toISOString(),
    }, { merge: true });
    return { connected: true, ...payload };
});
export const spotifyControl = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const { action, uri } = (request.data || {});
    const token = await refreshIfNeeded(uid);
    const base = 'https://api.spotify.com/v1/me/player';
    let url = '', method = 'PUT', body;
    switch (action) {
        case 'play':
            url = `${base}/play`;
            body = uri ? JSON.stringify({ uris: [uri] }) : undefined;
            break;
        case 'pause':
            url = `${base}/pause`;
            break;
        case 'next':
            url = `${base}/next`;
            method = 'POST';
            break;
        case 'previous':
            url = `${base}/previous`;
            method = 'POST';
            break;
        default: throw new HttpsError('invalid-argument', 'unknown action');
    }
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
    if (!res.ok && res.status !== 204)
        throw new HttpsError('internal', `Spotify ${res.status}`);
    return { ok: true };
});
export const spotifyPlaylists = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const token = await refreshIfNeeded(uid);
    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok)
        throw new HttpsError('internal', `Spotify ${res.status}`);
    return { ok: true, ...(await res.json()) };
});
export const spotifyListenAlong = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const { friend_id } = (request.data || {});
    if (!friend_id)
        throw new HttpsError('invalid-argument', 'friend_id required');
    if (friend_id === uid)
        return { ok: false, error: 'cannot_listen_along_self' };
    // Verify a friend/close-friend relationship between caller and target.
    const [fr1, fr2, cf1, cf2] = await Promise.all([
        db.collection('friend_requests')
            .where('sender_id', '==', uid).where('receiver_id', '==', friend_id).where('status', '==', 'accepted').limit(1).get(),
        db.collection('friend_requests')
            .where('sender_id', '==', friend_id).where('receiver_id', '==', uid).where('status', '==', 'accepted').limit(1).get(),
        db.collection('close_friends').where('owner_id', '==', friend_id).where('friend_id', '==', uid).limit(1).get(),
        db.collection('close_friends').where('owner_id', '==', uid).where('friend_id', '==', friend_id).limit(1).get(),
    ]);
    const isFriend = !fr1.empty || !fr2.empty || !cf1.empty || !cf2.empty;
    if (!isFriend) {
        throw new HttpsError('permission-denied', 'Not connected as friends');
    }
    // Respect target's music_settings privacy flags.
    const settingsSnap = await db.collection('music_settings').doc(friend_id).get();
    const settings = (settingsSnap.data() || {});
    const shareEnabled = settings.show_listening_activity !== false && settings.show_in_dms !== false;
    if (!shareEnabled) {
        return { ok: true, listening: false, error: 'sharing_disabled' };
    }
    const friendConn = await db.collection('spotify_connections').doc(friend_id).get();
    if (!friendConn.exists)
        return { ok: false, error: 'friend_not_connected' };
    const friendToken = await refreshIfNeeded(friend_id);
    const np = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: `Bearer ${friendToken}` } });
    if (np.status === 204)
        return { ok: true, listening: false };
    const data = await np.json();
    const uri = data?.item?.uri;
    if (!uri)
        return { ok: true, listening: false };
    const myToken = await refreshIfNeeded(uid);
    await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT', headers: { Authorization: `Bearer ${myToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [uri], position_ms: data.progress_ms || 0 }),
    });
    return { ok: true, listening: true, track: data.item };
});
//# sourceMappingURL=spotify.js.map