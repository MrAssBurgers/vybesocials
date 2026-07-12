/** Stable pair doc id for two profile ids (order-independent). */
export function friendshipPairId(profileA: string, profileB: string): string {
  return profileA < profileB ? `${profileA}_${profileB}` : `${profileB}_${profileA}`;
}

export function pairMembers(pairId: string): [string, string] | null {
  const idx = pairId.indexOf('_');
  if (idx <= 0) return null;
  const a = pairId.slice(0, idx);
  const b = pairId.slice(idx + 1);
  if (!a || !b) return null;
  return [a, b];
}

export function isPairMember(pairId: string, profileId: string): boolean {
  const members = pairMembers(pairId);
  return !!members && (members[0] === profileId || members[1] === profileId);
}
