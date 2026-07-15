/**
 * Device contacts — Despia native address book first, Web Contact Picker fallback.
 * Despia returns `{ "Display Name": ["+1555…"], … }`.
 */

import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';
import { normalizeE164 } from '@/lib/phone';

export type DeviceContactEntry = {
  /** Address-book display name (may be empty). */
  name: string;
  phones: string[];
};

function asPhoneList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value
    .map((p) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        return String(o.number ?? o.value ?? o.phone ?? '');
      }
      return '';
    })
    .filter(Boolean);
}

function parseDespiaContactsObject(contacts: unknown): DeviceContactEntry[] {
  if (!contacts || typeof contacts !== 'object') return [];
  if (Array.isArray(contacts)) {
    return contacts.map((c) => {
      const row = (c || {}) as Record<string, unknown>;
      const name = String(row.name ?? row.displayName ?? row.display_name ?? '').trim();
      const phones = asPhoneList(row.phones ?? row.phoneNumbers ?? row.tel ?? row.numbers);
      return { name, phones };
    });
  }
  return Object.entries(contacts as Record<string, unknown>).map(([name, phones]) => ({
    name: String(name || '').trim(),
    phones: asPhoneList(phones),
  }));
}

async function readDespiaContacts(): Promise<DeviceContactEntry[]> {
  await despiaCall('requestcontactpermission://');
  const data = await despiaCall('readcontacts://', ['contacts'], 45_000);
  if (!data?.contacts) {
    // Legacy window.contacts injection
    const w = window as Window & { contacts?: unknown };
    if (w.contacts) return parseDespiaContactsObject(w.contacts);
    throw new Error('contacts_blocked');
  }
  return parseDespiaContactsObject(data.contacts);
}

async function readWebContacts(): Promise<DeviceContactEntry[]> {
  const nav = navigator as Navigator & {
    contacts?: {
      select: (
        props: string[],
        opts?: { multiple?: boolean },
      ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
    };
  };
  if (!nav.contacts?.select) throw new Error('contacts_unsupported');
  try {
    const contacts = await nav.contacts.select(['name', 'tel'], { multiple: true });
    return (contacts || []).map((c) => ({
      name: (c.name?.[0] || '').trim(),
      phones: asPhoneList(c.tel),
    }));
  } catch (e: unknown) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
    if (name === 'SecurityError' || name === 'InvalidStateError') throw new Error('contacts_blocked');
    throw new Error('contacts_cancelled');
  }
}

/** Read device contacts with names + phones. Prefers Despia on native shells. */
export async function readDeviceContacts(): Promise<DeviceContactEntry[]> {
  if (typeof window === 'undefined') throw new Error('contacts_unsupported');

  if (isDespiaRuntime()) {
    try {
      const list = await readDespiaContacts();
      if (list.length) return list;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'contacts_blocked' || msg === 'contacts_cancelled') throw e;
      // Fall through to web picker when Despia bridge is incomplete.
    }
  }

  return readWebContacts();
}

export type NormalizedContactPhone = {
  name: string;
  e164: string;
};

/** Flatten contacts → unique E.164 rows, keeping first contact name per number. */
export function flattenContactPhones(
  contacts: DeviceContactEntry[],
  max = 2000,
): NormalizedContactPhone[] {
  const byPhone = new Map<string, string>();
  for (const c of contacts) {
    const name = c.name.trim();
    for (const raw of c.phones) {
      const e164 = normalizeE164(String(raw));
      if (!e164 || byPhone.has(e164)) continue;
      byPhone.set(e164, name);
      if (byPhone.size >= max) break;
    }
    if (byPhone.size >= max) break;
  }
  return Array.from(byPhone.entries()).map(([e164, name]) => ({ e164, name }));
}
