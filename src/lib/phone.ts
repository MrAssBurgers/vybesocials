// Phone utilities — E.164 normalization + SHA-256 hashing.
// Kept dependency-free: a minimal normalizer that handles the common cases.
// For full international parsing, swap in libphonenumber-js — same API.

export function normalizeE164(raw: string, defaultCountry: 'US' | 'CA' = 'US'): string | null {
  if (!raw) return null;
  let s = raw.trim();
  const hasPlus = s.startsWith('+');
  s = s.replace(/[^\d]/g, '');
  if (!s) return null;

  if (hasPlus) {
    // Strip leading zeros after the country code; basic validity check.
    if (s.length < 8 || s.length > 15) return null;
    return '+' + s;
  }

  // US / CA fallback — 10 digit local or 11 digit with leading 1.
  if (defaultCountry === 'US' || defaultCountry === 'CA') {
    if (s.length === 11 && s.startsWith('1')) return '+' + s;
    if (s.length === 10) return '+1' + s;
  }
  if (s.length >= 8 && s.length <= 15) return '+' + s;
  return null;
}

export function formatDisplayUS(e164: string): string {
  // +1XXXXXXXXXX → (XXX) XXX-XXXX
  if (!e164.startsWith('+1') || e164.length !== 12) return e164;
  const d = e164.slice(2);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function maskPhone(e164: string): string {
  if (!e164 || e164.length < 4) return e164 || '';
  return e164.slice(0, 2) + '•••••' + e164.slice(-4);
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPhoneE164(e164: string): Promise<string> {
  return sha256Hex(e164.toLowerCase());
}
