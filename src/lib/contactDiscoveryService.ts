import { invokeFunction } from '@/lib/firebase/functionsService';
import { reportAccountGuard, type ReportAccountGuard } from '@/lib/reportModerationService';
import { hashPhoneE164 } from '@/lib/phone';
import type { DeviceContactEntry } from '@/lib/nativeContacts';

export interface ContactActor { uid: string; profileId: string; guard: ReportAccountGuard }
export interface ContactDiscoveryState {
  success: true; ownerUid: string; profileId: string; eligible: boolean; discoverable: boolean;
  maskedPhone: string | null; legacyPhoneNeedsVerification: boolean;
}
export interface ContactMatch {
  id: string; username: string; display_name: string | null; avatar_url: string | null;
  is_verified: boolean; phone_hash: string; contactName?: string;
}
export interface ContactSearchResult { matches: ContactMatch[]; invites: { name: string; phone: string }[]; checked: number; skipped: number; limited: boolean }
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === 'string' && !!value && value.length <= 128 && !value.includes('/');
const nullableText = (value: unknown, max: number) => value === null || (typeof value === 'string' && value.length <= max);
export function captureContactActor(uid: string, profileId: string, viewGuard?: ReportAccountGuard): ContactActor {
  const account = reportAccountGuard(uid);
  const guard = () => { account(); viewGuard?.(); if (!validId(profileId)) throw new Error('Wait for your profile to load.'); };
  guard(); return { uid, profileId, guard };
}
async function contactRequest(input: Record<string, unknown>, actor: ContactActor) {
  actor.guard();
  const result = await invokeFunction<unknown>('match-contacts', { ...input, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
  actor.guard();
  if (result.error) throw new Error(result.error.message || 'Contact discovery is unavailable. Please retry.');
  if (!row(result.data) || result.data.success !== true || result.data.ownerUid !== actor.uid || result.data.profileId !== actor.profileId) throw new Error('Contact discovery was not confirmed. Please retry.');
  return result.data;
}
export async function contactDiscoveryState(actor: ContactActor, discoverable?: boolean): Promise<ContactDiscoveryState> {
  const data = await contactRequest(discoverable === undefined ? { action: 'state' } : { action: 'setDiscoverable', discoverable }, actor);
  if (typeof data.eligible !== 'boolean' || typeof data.discoverable !== 'boolean' || typeof data.legacyPhoneNeedsVerification !== 'boolean'
    || !(data.maskedPhone === null || (typeof data.maskedPhone === 'string' && /^\+•••\d{4}$/.test(data.maskedPhone)))
    || (data.discoverable && !data.eligible) || (discoverable !== undefined && data.discoverable !== discoverable)) throw new Error('Your discovery preference was not confirmed. Refresh and retry.');
  return data as unknown as ContactDiscoveryState;
}

/** Reject ambiguous local numbers/extensions instead of guessing international country codes. */
export function normalizeContactPhone(raw: string) {
  const input = raw.trim();
  if (!input || !/^[+\d\s().-]+$/.test(input) || (input.includes('+') && !input.startsWith('+')) || (input.match(/\+/g) || []).length > 1) return null;
  const digits = input.replace(/\D/g, '');
  if (input.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  if (/^[2-9]\d{9}$/.test(digits)) return `+1${digits}`;
  return null;
}
export async function matchDeviceContacts(contacts: DeviceContactEntry[], actor: ContactActor): Promise<ContactSearchResult> {
  actor.guard();
  const phones = new Map<string, string>(); let skipped = 0, limited = false;
  for (const contact of contacts) {
    for (const raw of contact.phones) {
      const phone = normalizeContactPhone(raw);
      if (!phone) { skipped++; continue; }
      if (phones.has(phone)) continue;
      if (phones.size >= 2000) { limited = true; break; }
      phones.set(phone, contact.name.slice(0, 150));
    }
    if (limited) break;
  }
  const names = new Map<string, string>(), localNumbers = new Map<string, string>();
  for (const [phone, name] of phones) { actor.guard(); const hash = await hashPhoneE164(phone); names.set(hash, name); localNumbers.set(hash, phone); }
  actor.guard();
  const hashes = [...names.keys()], matches: ContactMatch[] = [];
  for (let offset = 0; offset < hashes.length; offset += 200) {
    const batch = hashes.slice(offset, offset + 200);
    const data = await contactRequest({ action: 'match', hashes: batch }, actor);
    if (!Array.isArray(data.matches) || data.matches.length > batch.length) throw new Error('Invalid contact results. Please retry.');
    for (const value of data.matches) {
      if (!row(value) || !validId(value.id) || typeof value.username !== 'string' || value.username.length > 100
        || !nullableText(value.display_name, 150) || !nullableText(value.avatar_url, 2048) || typeof value.is_verified !== 'boolean'
        || typeof value.phone_hash !== 'string' || !batch.includes(value.phone_hash) || 'phone_number' in value) throw new Error('Invalid contact results. Please retry.');
      if (!matches.some(match => match.id === value.id)) matches.push({ ...value, contactName: names.get(value.phone_hash) } as unknown as ContactMatch);
    }
  }
  const matched = new Set(matches.map(match => match.phone_hash));
  const invites = [...localNumbers].filter(([hash]) => !matched.has(hash)).slice(0, 40).map(([hash, phone]) => ({ phone, name: names.get(hash) || phone }));
  actor.guard(); return { matches, invites, checked: phones.size, skipped, limited };
}

export function contactFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'contacts_unsupported') return 'This browser cannot open device contacts. Open VYBE in the phone app or a browser with a contact picker.';
  if (message === 'contacts_blocked') return 'Contact access was denied. Allow contacts in your device settings, then retry.';
  if (message === 'contacts_failed') return 'Your device could not read contacts. Please retry.';
  return message || 'Contact discovery is unavailable. Please retry.';
}
