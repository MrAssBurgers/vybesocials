import { beforeEach, describe, expect, it } from 'vitest';
import {
  readFilterPrefs,
  readFilterScroll,
  readStoredInboxFilter,
  visibleFiltersForProfile,
  writeFilterPrefs,
  writeFilterScroll,
  writeStoredInboxFilter,
} from '@/lib/dmInboxFilterPersistence';
import { DM_INBOX_FILTERS } from '@/lib/dmInboxOrganize';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('readStoredInboxFilter / writeStoredInboxFilter', () => {
  it('defaults to "all" when nothing is stored', () => {
    expect(readStoredInboxFilter()).toBe('all');
  });

  it('round-trips a valid filter', () => {
    writeStoredInboxFilter('needs_reply');
    expect(readStoredInboxFilter()).toBe('needs_reply');
  });

  it('migrates legacy tab ids to "all"', () => {
    sessionStorage.setItem('vybe-dm-inbox-filter', 'best_friends');
    expect(readStoredInboxFilter()).toBe('all');
    sessionStorage.setItem('vybe-dm-inbox-filter', 'requests');
    expect(readStoredInboxFilter()).toBe('all');
  });

  it('migrates legacy "calls" tab to "unread"', () => {
    sessionStorage.setItem('vybe-dm-inbox-filter', 'calls');
    expect(readStoredInboxFilter()).toBe('unread');
  });

  it('ignores unknown garbage values', () => {
    sessionStorage.setItem('vybe-dm-inbox-filter', 'not-a-real-filter');
    expect(readStoredInboxFilter()).toBe('all');
  });
});

describe('filter scroll persistence', () => {
  it('defaults to 0 for an untouched filter', () => {
    expect(readFilterScroll('active')).toBe(0);
  });

  it('stores per-filter scroll independently', () => {
    writeFilterScroll('all', 120);
    writeFilterScroll('pinned', 40);
    expect(readFilterScroll('all')).toBe(120);
    expect(readFilterScroll('pinned')).toBe(40);
  });

  it('clamps negative scroll to 0', () => {
    writeFilterScroll('groups', -50);
    expect(readFilterScroll('groups')).toBe(0);
  });
});

describe('filter order/visibility prefs', () => {
  it('falls back to the default order when no profile is given', () => {
    expect(readFilterPrefs(undefined).order).toEqual(DM_INBOX_FILTERS);
    expect(readFilterPrefs(undefined).hidden).toEqual([]);
  });

  it('round-trips custom order + hidden filters for a profile', () => {
    writeFilterPrefs('user-1', { order: ['unread', 'all', 'active'], hidden: ['groups'] });
    const prefs = readFilterPrefs('user-1');
    expect(prefs.order).toEqual(['unread', 'all', 'active']);
    expect(prefs.hidden).toEqual(['groups']);
  });

  it('is scoped per profile id', () => {
    writeFilterPrefs('user-1', { order: ['unread'], hidden: [] });
    expect(readFilterPrefs('user-2').order).toEqual(DM_INBOX_FILTERS);
  });

  it('ignores unknown filter ids written by a stale client', () => {
    localStorage.setItem(
      'vybe-dm-inbox-filter-prefs:user-1',
      JSON.stringify({ order: ['unread', 'legacy_tab'], hidden: ['legacy_tab'] }),
    );
    const prefs = readFilterPrefs('user-1');
    expect(prefs.order).toEqual(['unread']);
    expect(prefs.hidden).toEqual([]);
  });

  it('visibleFiltersForProfile excludes hidden filters and appends any missing defaults', () => {
    writeFilterPrefs('user-1', { order: ['active', 'all'], hidden: ['pinned'] });
    const visible = visibleFiltersForProfile('user-1');
    expect(visible).not.toContain('pinned');
    expect(visible[0]).toBe('active');
    expect(visible[1]).toBe('all');
    // Filters missing from the stored order still show up (appended).
    expect(visible).toContain('unread');
  });
});
