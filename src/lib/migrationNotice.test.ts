import { describe, expect, it } from 'vitest';
import { isRetiredUpgradeNotice } from './migrationNotice';

describe('retired migration announcement', () => {
  it('hides the seeded announcement even if its title was changed', () => {
    expect(isRetiredUpgradeNotice({ id: 'firebase-migration-2026-06', title: 'Migration' })).toBe(true);
    expect(isRetiredUpgradeNotice({ type: 'announcement', announcement_id: 'firebase-migration-2026-06' })).toBe(true);
  });
  it('recognizes historical notifications without a linked announcement ID', () => {
    expect(isRetiredUpgradeNotice({ type: 'announcement', title: 'VYBE was upgraded' })).toBe(true);
    expect(isRetiredUpgradeNotice({ type: 'announcement', title: ' VYBE  has been upgraded! ' })).toBe(true);
  });
  it('keeps unrelated announcements and personal notification content', () => {
    expect(isRetiredUpgradeNotice({ type: 'announcement', title: 'New games in VYBE' })).toBe(false);
    expect(isRetiredUpgradeNotice({ type: 'comment', title: 'VYBE was upgraded' })).toBe(false);
    expect(isRetiredUpgradeNotice({ title: null })).toBe(false);
  });
});
