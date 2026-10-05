// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRetiredUpgradeNotice as clientPredicate } from './migrationNotice';
import { isRetiredUpgradeNotice as serverPredicate } from '../../functions/src/_shared/retiredUpgradeNotice';

const mocks = vi.hoisted(() => ({ push: vi.fn(), preferences: vi.fn(), collection: vi.fn() }));
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: { collection: mocks.collection } }));
vi.mock('../../functions/src/_shared/fcmPush.js', () => ({
  dispatchDmPushToProfile: mocks.push, dispatchCallPushToProfile: vi.fn(), messagePreview: vi.fn(),
}));
vi.mock('../../functions/src/_shared/onesignalPush.js', () => ({ resolvePushTargetProfileId: vi.fn() }));
vi.mock('../../functions/src/_shared/pushPreferences.js', () => ({
  loadNotificationPreferences: mocks.preferences, isBlockedByQuietHours: () => false,
  isPushAllowedForType: (type: string, prefs: Record<string, unknown>) => type !== 'announcement' || prefs.announcements_enabled !== false, sanitizeDmPushBody: vi.fn(),
}));
vi.mock('../../functions/src/_shared/notificationPreferenceAuthority.js', () => ({ readDeliveryNotificationContext: async (_db: unknown, profileId: string) => ({ ownerUid: profileId, profileId, preferences: await mocks.preferences(profileId) }) }));
vi.mock('../../functions/src/_shared/smartPushGate.js', () => ({ logPushDelivery: vi.fn(), shouldSkipRecipientPush: vi.fn() }));
import { onSocialNotificationCreated } from '../../functions/src/pushTriggers';

function send(notification: Record<string, unknown>, id = 'notification-123') {
  return onSocialNotificationCreated.run({
    data: { id, data: () => ({ user_id: 'demo-recipient', actor_id: 'demo-author', ...notification }) },
  } as Parameters<typeof onSocialNotificationCreated.run>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.push.mockResolvedValue(undefined);
  mocks.preferences.mockResolvedValue({});
  mocks.collection.mockImplementation(() => { throw new Error('Unexpected database read'); });
});

describe('retired upgrade announcement push boundary', () => {
  it.each([
    { type: 'announcement', title: 'VYBE was upgraded' },
    { type: 'announcement', title: ' VYBE  has been upgraded! ' },
    { type: 'announcement', announcement_id: 'firebase-migration-2026-06', title: 'Changed heading' },
    { type: 'announcement', id: 'firebase-migration-2026-06', title: 'Changed heading' },
    { title: 'VYBE was upgraded' },
  ])('suppresses the exact retired record before provider or preference reads: %j', async notice => {
    await send(notice);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.preferences).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it('also recognizes a retired document identity without a duplicated data ID', async () => {
    await send({ type: 'announcement', title: 'Changed heading' }, 'firebase-migration-2026-06');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.preferences).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'announcement', title: 'New games in VYBE' },
    { type: 'announcement', title: 'Other news', body: 'VYBE was upgraded' },
    { type: 'comment', title: 'VYBE was upgraded' },
    { type: 'like', title: 'VYBE has been upgraded!' },
    { type: 'general', title: 'VYBE was upgraded' },
  ])('preserves other announcements and personal content: %j', async notice => {
    await send(notice);
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith('demo-recipient', expect.objectContaining({ title: notice.title, type: notice.type }));
  });

  it('keeps normal announcement preference enforcement', async () => {
    mocks.preferences.mockResolvedValue({ announcements_enabled: false });
    await send({ type: 'announcement', title: 'New games in VYBE' });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('keeps frontend and push filtering compatible for historical and unrelated shapes', () => {
    for (const notice of [
      {}, { title: null }, { title: 'VYBE WAS UPGRADED...' },
      { type: 'announcement', title: ' VYBE  has been upgraded! ' },
      { id: 'firebase-migration-2026-06', title: 'Updated heading' },
      { type: 'comment', id: 'firebase-migration-2026-06', title: 'VYBE was upgraded' },
      { type: 'announcement', title: 'An upgraded video editor is here' },
    ]) expect(serverPredicate(notice)).toBe(clientPredicate(notice));
  });
});

describe('retired migration seeder', () => {
  it.each(['0', '1'])('fails clearly without loading credentials or writing data (legacy skip flag %s)', skip => {
    const script = fileURLToPath(new URL('../../scripts/migrate-firebase/seed-migration-announcement.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8', timeout: 5000,
      env: {
        ...process.env, FIREBASE_PROJECT_ID: 'demo-retired-notice',
        GOOGLE_APPLICATION_CREDENTIALS: 'intentionally-missing-do-not-load.json',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:1', SKIP_MIGRATION_NOTIFICATIONS: skip,
      },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('has been retired');
    expect(result.stderr).toContain('No data was changed');
    expect(result.stderr).not.toContain('Service account');
  });
});
