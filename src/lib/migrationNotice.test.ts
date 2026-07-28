import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  dismissMigrationNotice,
  isLegacyMigrationAccount,
  MIGRATION_NOTICE_CUTOFF_ISO,
  MIGRATION_NOTICE_STORAGE_KEY,
  shouldShowMigrationNotice,
} from './migrationNotice';

describe('migrationNotice', () => {
  beforeEach(() => {
    localStorage.removeItem(MIGRATION_NOTICE_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(MIGRATION_NOTICE_STORAGE_KEY);
  });

  it('treats pre-cutoff accounts as legacy', () => {
    expect(isLegacyMigrationAccount('2026-01-01T00:00:00.000Z')).toBe(true);
    expect(isLegacyMigrationAccount(MIGRATION_NOTICE_CUTOFF_ISO)).toBe(false);
    expect(isLegacyMigrationAccount('2026-07-28T00:00:00.000Z')).toBe(false);
    expect(isLegacyMigrationAccount(null)).toBe(false);
  });

  it('hides in-app notice for brand-new accounts', () => {
    expect(shouldShowMigrationNotice('2026-07-28T12:00:00.000Z')).toBe(false);
  });

  it('still allows auth-surface notice without a profile date', () => {
    expect(shouldShowMigrationNotice(null, { authSurface: true })).toBe(true);
  });

  it('respects dismiss for auth surface', () => {
    dismissMigrationNotice();
    expect(shouldShowMigrationNotice(null, { authSurface: true })).toBe(false);
  });
});
