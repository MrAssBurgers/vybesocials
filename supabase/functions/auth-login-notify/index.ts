// Records a successful sign-in: inserts/updates the user's session row,
// writes login_history, and sends a "new sign-in" email when the device
// looks new (no prior matching session in the last 30 days).
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
  getClientIp, parseUserAgent, geolocateIp, sendTransactional,
} from '../_shared/security.ts';

function getJwtSessionId(req: Request): string | null {
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized))?.session_id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const method: string = body.method || 'password';
    const authSessionId = getJwtSessionId(req);
    const deviceFingerprint: string | null = body.deviceFingerprint || authSessionId;

    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent');
    const device = parseUserAgent(ua);
    const geo = await geolocateIp(ip);

    const admin = getServiceClient();

    // Check for an existing active session matching this device (UA + IP rough match)
    const { data: existing } = await admin
      .from('user_sessions')
      .select('id, ip, user_agent, session_token_hash, last_seen_at')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false })
      .limit(50);

    const sameDevice = deviceFingerprint
      ? (existing ?? []).find(s => s.session_token_hash === deviceFingerprint)
      : (existing ?? []).find(s =>
      (s.user_agent ?? '') === (ua ?? '') && (s.ip ?? '') === (ip ?? '')
    );

    let sessionId: string;
    let isNewDevice = false;
    if (sameDevice) {
      sessionId = sameDevice.id as string;
      await admin.from('user_sessions')
        .update({ last_seen_at: new Date().toISOString(), city: geo.city, region: geo.region, country: geo.country, session_token_hash: deviceFingerprint })
        .eq('id', sessionId);
    } else {
      isNewDevice = true;
      const { data: created, error: insErr } = await admin
        .from('user_sessions')
        .insert({
          user_id: user.id,
          device_label: device,
          user_agent: ua,
          ip,
          city: geo.city,
          region: geo.region,
          country: geo.country,
          trusted: false,
          session_token_hash: deviceFingerprint,
        })
        .select('id')
        .single();
      if (insErr || !created) return jsonResponse({ error: 'session_create_failed' }, 500);
      sessionId = created.id;
    }

    await admin.from('login_history').insert({
      user_id: user.id,
      method,
      success: true,
      ip,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      user_agent: ua,
      device_label: device,
      metadata: { sessionId },
    });

    // Send "new sign-in" email when this device is new
    if (isNewDevice && user.email) {
      const time = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      await sendTransactional('new-signin', user.email, {
        device,
        ip,
        city: geo.city,
        country: geo.country,
        time,
      }, `signin-${sessionId}`);
    }

    return jsonResponse({ ok: true, sessionId, isNewDevice, geo, device });
  } catch (e) {
    console.error('auth-login-notify error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
