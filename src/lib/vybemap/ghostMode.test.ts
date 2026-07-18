import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GHOST_UNTIL_KEY,
  SHARING_PREF_KEY,
  persistGhostUntil,
  persistSharingPref,
  resolveSharingOnLoad,
} from '@/lib/vybemap/ghostMode';

describe('ghostMode prefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('defaults to sharing live when unset', () => {
    expect(resolveSharingOnLoad()).toEqual({ sharing: true, ghostUntil: null });
  });

  it('restores live when temporary ghost expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    persistSharingPref(false);
    persistGhostUntil(Date.now() - 1000);
    expect(resolveSharingOnLoad()).toEqual({ sharing: true, ghostUntil: null });
    expect(localStorage.getItem(SHARING_PREF_KEY)).toBe('true');
    expect(localStorage.getItem(GHOST_UNTIL_KEY)).toBeNull();
  });

  it('keeps temporary ghost while until is in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    const until = Date.now() + 60_000;
    persistGhostUntil(until);
    expect(resolveSharingOnLoad()).toEqual({ sharing: false, ghostUntil: until });
  });

  it('keeps permanent ghost when sharing=false and no until', () => {
    persistSharingPref(false);
    expect(resolveSharingOnLoad()).toEqual({ sharing: false, ghostUntil: null });
  });
});
