/**
 * Capture + persist Sign in with Apple name (first auth only).
 * Apple only returns name once — stash immediately and never re-require it in onboarding.
 */
import { updateProfile } from 'firebase/auth';
import type { VybeUser } from '@/lib/firebase/types';

const STORAGE_KEY = 'vybe_apple_name_v1';

export type AppleProvidedName = {
  firstName: string;
  lastName: string;
  displayName: string;
};

type AppleNamePayload = {
  name?: {
    firstName?: string;
    lastName?: string;
    givenName?: string;
    familyName?: string;
  };
  givenName?: string;
  familyName?: string;
  firstName?: string;
  lastName?: string;
};

export function parseAppleUserName(user: unknown): AppleProvidedName | null {
  if (!user || typeof user !== 'object') return null;
  const u = user as AppleNamePayload;
  const first =
    String(u.name?.firstName || u.name?.givenName || u.givenName || u.firstName || '').trim();
  const last =
    String(u.name?.lastName || u.name?.familyName || u.familyName || u.lastName || '').trim();
  if (!first && !last) return null;
  const displayName = [first, last].filter(Boolean).join(' ').trim();
  if (!displayName) return null;
  return { firstName: first, lastName: last, displayName };
}

export function stashAppleProvidedName(name: AppleProvidedName): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(name));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(name));
  } catch {
    /* ignore */
  }
}

export function readAppleProvidedName(): AppleProvidedName | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppleProvidedName>;
    const firstName = String(parsed.firstName || '').trim();
    const lastName = String(parsed.lastName || '').trim();
    const displayName =
      String(parsed.displayName || '').trim() ||
      [firstName, lastName].filter(Boolean).join(' ').trim();
    if (!displayName) return null;
    return { firstName, lastName, displayName };
  } catch {
    return null;
  }
}

export function clearAppleProvidedName(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isAppleAuthUser(user: VybeUser | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.identities?.some((i) => i.provider === 'apple'));
}

/** True when Apple already supplied a name (or profile already has one for Apple users). */
export function hasAppleSatisfiedName(opts: {
  user?: VybeUser | null;
  profileDisplayName?: string | null;
  profileFirstName?: string | null;
  profileLastName?: string | null;
}): boolean {
  if (!isAppleAuthUser(opts.user)) return false;
  const stashed = readAppleProvidedName();
  if (stashed?.displayName) return true;
  if (opts.profileDisplayName?.trim()) return true;
  if (opts.profileFirstName?.trim() || opts.profileLastName?.trim()) return true;
  const metaName = String(opts.user?.user_metadata?.full_name || opts.user?.user_metadata?.name || '').trim();
  if (metaName) return true;
  return false;
}

/**
 * Persist Apple name to Firebase Auth displayName + Firestore profile fields.
 * Safe to call multiple times; no-ops if name empty.
 */
export async function applyAppleProvidedName(opts: {
  authUid: string;
  name: AppleProvidedName;
  profileId?: string | null;
}): Promise<void> {
  stashAppleProvidedName(opts.name);

  try {
    const { firebaseAuth } = await import('@/lib/firebase');
    const current = firebaseAuth.auth?.currentUser;
    if (current && !current.displayName && opts.name.displayName) {
      await updateProfile(current, { displayName: opts.name.displayName });
    }
  } catch {
    /* ignore — profile write below still helps */
  }

  if (!opts.profileId && !opts.authUid) return;

  try {
    const { updateUserProfile } = await import('@/lib/firebase/users');
    const id = opts.profileId || opts.authUid;
    await updateUserProfile(id, {
      first_name: opts.name.firstName || undefined,
      last_name: opts.name.lastName || undefined,
      display_name: opts.name.displayName,
    } as Record<string, unknown>);
  } catch {
    /* profile may not exist yet — onboarding will apply stashed name */
  }
}

/** Parse Apple JS / native payload and persist if name present. */
export async function captureAndApplyAppleName(opts: {
  userPayload?: unknown;
  givenName?: string;
  familyName?: string;
  authUid?: string | null;
  profileId?: string | null;
}): Promise<AppleProvidedName | null> {
  const fromUser = parseAppleUserName(opts.userPayload);
  const fromParts =
    opts.givenName || opts.familyName
      ? parseAppleUserName({
          givenName: opts.givenName,
          familyName: opts.familyName,
        })
      : null;
  const name = fromUser || fromParts;
  if (!name) return null;
  stashAppleProvidedName(name);
  if (opts.authUid) {
    await applyAppleProvidedName({
      authUid: opts.authUid,
      name,
      profileId: opts.profileId,
    });
  }
  return name;
}
