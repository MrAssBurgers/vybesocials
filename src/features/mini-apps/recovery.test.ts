import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearMiniAppRecovery, readMiniAppRecovery, readMiniAppRecoveryEntry, saveMiniAppRecovery } from './recovery';
import { MINI_APP_TEMPLATES } from './templates';
import { MINI_APP_CODE_LIMIT } from './model';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('private local mini app recovery', () => {
  it.each(['\u0000', '\ud800', '\\', '😀'])('round trips a maximum-sized draft with escaped or Unicode source %#', character => {
    const source = { ...MINI_APP_TEMPLATES[0].source, title: '\u0001'.repeat(60), description: '\u0002'.repeat(240), html: '', css: '', javascript: character.repeat(MINI_APP_CODE_LIMIT / character.length) };
    expect(saveMiniAppRecovery('alice', source, undefined, 'pending-id')).toBe(true);
    expect(readMiniAppRecoveryEntry('alice')).toEqual({ source, pendingId: 'pending-id' });
  });
  it('does not report a backup when storage rejects it or replace a prior backup with invalid source', () => {
    const source = MINI_APP_TEMPLATES[0].source;
    expect(saveMiniAppRecovery('alice', source)).toBe(true);
    expect(saveMiniAppRecovery('alice', { ...source, javascript: 'x'.repeat(MINI_APP_CODE_LIMIT + 1) })).toBe(false);
    expect(readMiniAppRecovery('alice')).toEqual(source);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(saveMiniAppRecovery('alice', { ...source, title: 'New edit' })).toBe(false);
    expect(readMiniAppRecovery('alice')).toEqual(source);
  });
  it('stores only source fields and bounds metadata on both read and write', () => {
    const source = MINI_APP_TEMPLATES[0].source;
    expect(saveMiniAppRecovery('alice', { ...source, token: 'omit' } as typeof source)).toBe(true);
    expect(localStorage.getItem('vybe.mini-app.recovery.alice.new')).not.toContain('omit');
    expect(saveMiniAppRecovery('alice', { ...source, title: 'x'.repeat(61) })).toBe(false);
    localStorage.setItem('vybe.mini-app.recovery.alice.new', JSON.stringify({ source: { ...source, description: 'x'.repeat(241) }, savedAt: Date.now() }));
    expect(readMiniAppRecovery('alice')).toBeNull();
    localStorage.setItem('vybe.mini-app.recovery.alice.new', ' '.repeat(700000));
    expect(readMiniAppRecovery('alice')).toBeNull();
  });
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
