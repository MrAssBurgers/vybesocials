import type { LoginStreakReceipt } from '@/lib/loginStreakService';
export function streakReceipt(overrides: Partial<LoginStreakReceipt> = {}): LoginStreakReceipt {
  return { ok: true, ownerUid: 'alice', profileId: 'profile-alice', accountCreatedAt: 1700000000000,
    action: 'read', requestId: null, serverTime: Date.now(), revision: 'a'.repeat(48), timezone: 'UTC', timezoneChanged: false,
    currentDay: '2026-10-05', streak: 1, longestStreak: 1, currentStreakVerified: true, needsLoginToday: false,
    expiresAt: '2026-10-07T00:00:00.000Z', isNewDay: false, streakExtended: false, streakBroken: false, restored: false, replayed: false,
    legacyHistory: { status: 'none', currentStreak: null, longestStreak: null, lastLoginDate: null },
    restore: { eligible: false, previousStreak: null, availableUntil: null, access: 'launch-free', reason: 'no-break' }, ...overrides };
}
