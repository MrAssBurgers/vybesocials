export type StaffRole = 'owner' | 'admin' | 'moderator' | null | undefined;

export function isAdminRole(role: StaffRole): boolean {
  return role === 'admin' || role === 'owner';
}

export function isModOrAdminRole(role: StaffRole): boolean {
  return isAdminRole(role) || role === 'moderator';
}

/** True while auth or role lookup is still in flight. */
export function isStaffGateLoading(
  authReady: boolean,
  roleLoading: boolean,
  roleFetched: boolean,
): boolean {
  return !authReady || roleLoading || !roleFetched;
}
