// Shared helpers for security edge functions.
// deno-lint-ignore-file
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function getUserFromAuthHeader(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const token = auth.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
}

export function getClientIp(req: Request): string | null {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip');
}

export function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  // Lightweight UA parsing: pick browser + OS keywords
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux'
    : 'Device';
  return `${os} — ${browser}`;
}

export interface GeoInfo {
  city: string | null;
  region: string | null;
  country: string | null;
}

export async function geolocateIp(ip: string | null): Promise<GeoInfo> {
  if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { city: null, region: null, country: null };
  }
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { city: null, region: null, country: null };
    const j = await r.json();
    return {
      city: j.city ?? null,
      region: j.region ?? null,
      country: j.country_name ?? j.country ?? null,
    };
  } catch {
    return { city: null, region: null, country: null };
  }
}

// SHA-256 hex hash (used for code verification — codes are short-lived)
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generate6DigitCode(): string {
  // Cryptographically strong 6-digit code
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, '0');
}

export function generateNonce(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

// Best-effort enqueue email via send-transactional-email.
// Returns { ok, error } so callers can react when delivery fails (and avoid
// telling the user "code sent" when nothing was actually queued).
export async function sendTransactional(
  templateName: string,
  recipientEmail: string,
  templateData: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = getServiceClient();
    const { data, error } = await admin.functions.invoke('send-transactional-email', {
      body: { templateName, recipientEmail, templateData, idempotencyKey },
    });
    if (error) {
      const msg = (error as any)?.message || String(error);
      console.warn('sendTransactional invoke error', templateName, msg);
      return { ok: false, error: msg };
    }
    if ((data as any)?.error) {
      console.warn('sendTransactional response error', templateName, (data as any).error);
      return { ok: false, error: String((data as any).error) };
    }
    return { ok: true };
  } catch (e) {
    const msg = (e as any)?.message || String(e);
    console.warn('sendTransactional failed', templateName, msg);
    return { ok: false, error: msg };
  }
}
