import { describe, expect, it } from 'vitest';
import { clearMiniAppRecovery, readMiniAppRecovery, readMiniAppRecoveryEntry, saveMiniAppRecovery } from './recovery';
import { MINI_APP_TEMPLATES } from './templates';

describe('private local mini app recovery', () => {
  it('scopes recovery to both account and draft', () => {
    const source = MINI_APP_TEMPLATES[0].source;
    expect(saveMiniAppRecovery('alice', source, 'a')).toBe(true);
    expect(readMiniAppRecovery('alice', 'a')).toEqual(source);
    expect(readMiniAppRecovery('bob', 'a')).toBeNull();
    expect(readMiniAppRecovery('alice', 'b')).toBeNull();
    clearMiniAppRecovery('alice', 'a');
    expect(readMiniAppRecovery('alice', 'a')).toBeNull();
  });
  it('recovers temporarily invalid in-progress titles without publishing them', () => {
    const source = { ...MINI_APP_TEMPLATES[0].source, title: '' };
    saveMiniAppRecovery('alice', source);
    expect(readMiniAppRecovery('alice')).toEqual(source);
  });
  it('rejects corrupt recovery input', () => {
    localStorage.setItem('vybe.mini-app.recovery.alice.new', '{oops');
    expect(readMiniAppRecovery('alice')).toBeNull();
  });
  it('retains a pending draft identity only in its own account recovery', () => {
    saveMiniAppRecovery('alice', MINI_APP_TEMPLATES[0].source, undefined, 'same-draft-after-reload');
    expect(readMiniAppRecoveryEntry('alice')?.pendingId).toBe('same-draft-after-reload');
    expect(readMiniAppRecoveryEntry('bob')).toBeNull();
  });
  it.each([undefined, 'bad', Date.now() + 86400000, Date.now() - 31 * 86400000])('rejects missing, malformed or expired recovery timestamps: %s', savedAt => {
    localStorage.setItem('vybe.mini-app.recovery.alice.new', JSON.stringify({ source: MINI_APP_TEMPLATES[0].source, savedAt }));
    expect(readMiniAppRecovery('alice')).toBeNull();
  });
});
