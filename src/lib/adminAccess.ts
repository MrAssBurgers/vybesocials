import { getEffectiveProfileId } from '@/lib/profileCache';

export type StaffRole = 'owner' | 'admin' | 'moderator' | null | undefined;

export function isAdminRole(role: StaffRole): boolean {
  return role === 'admin' || role === 'owner';
}

export function isModOrAdminRole(role: StaffRole): boolean {
  return isAdminRole(role) || role === 'moderator';
}

/** Auth session or cached profile — covers offline boot when `user` is not hydrated yet. */
export function hasStaffIdentity(
  user: { id?: string } | null | undefined,
  liveProfileId?: string | null,
): boolean {
  return !!(user?.id || getEffectiveProfileId(liveProfileId));
}

/** Enable staff/admin queries once auth is settled and identity is known. */
export function isStaffQueryEnabled(
  authReady: boolean,
  user: { id?: string } | null | undefined,
  liveProfileId?: string | null,
): boolean {
  return authReady && hasStaffIdentity(user, liveProfileId);
}

/** True while auth or role lookup is still in flight. */
export function isStaffGateLoading(
  authReady: boolean,
  roleLoading: boolean,
  roleFetched: boolean,
  hasIdentity = true,
): boolean {
  if (!authReady || !hasIdentity) return true;
  return roleLoading || !roleFetched;
}
