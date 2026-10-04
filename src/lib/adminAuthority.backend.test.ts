// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, reads: 0 }));
vi.mock('../../functions/node_modules/firebase-admin/lib/esm/app/index.js', () => ({ getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock('../../functions/node_modules/firebase-admin/lib/esm/auth/index.js', () => ({ getAuth: () => ({}) }));
vi.mock('../../functions/node_modules/firebase-admin/lib/esm/messaging/index.js', () => ({ getMessaging: () => ({}) }));
vi.mock('../../functions/node_modules/firebase-admin/lib/esm/firestore/index.js', () => ({
  getFirestore: () => ({ collection: (name: string) => {
    if (name !== 'user_roles') throw new Error('Unexpected authority collection');
    const constraints: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      where: (field: string, op: string, value: string | string[]) => {
        constraints.push(row => op === 'in' ? (value as string[]).includes(row[field] as string) : row[field] === value);
        return query;
      },
      get: async () => { state.reads++; const rows = state.rows.filter(row => constraints.every(check => check(row))); return { docs: rows.map(row => ({ data: () => row })) }; },
    };
    return query;
  } }),
}));

import { requireAdmin } from '../../functions/src/_shared/admin';
const request = (admin: unknown = false) => ({ data: {}, auth: { uid: 'staff-user', token: { admin } } }) as Parameters<typeof requireAdmin>[0];
beforeEach(() => { state.rows = []; state.reads = 0; });

describe('server admin authority', () => {
  it('rejects unauthenticated requests before database access', async () => {
    await expect(requireAdmin({ data: {} } as Parameters<typeof requireAdmin>[0])).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(state.reads).toBe(0);
  });
  it('keeps an explicit boolean admin claim authoritative', async () => {
    state.rows = [{ user_id: 'staff-user', role: 'admin', enabled: false }];
    await expect(requireAdmin(request(true))).resolves.toBe('staff-user');
    expect(state.reads).toBe(0);
  });
  it.each([undefined, false, 'true', 1, null])('does not accept a non-admin claim %s', async flag => {
    await expect(requireAdmin(request(flag))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it.each(['admin', 'owner'])('preserves legacy %s grants without enabled', async role => {
    state.rows = [{ user_id: 'staff-user', role }];
    await expect(requireAdmin(request())).resolves.toBe('staff-user');
  });
  it.each([false, null, 'true', 'false', 0, 1])('rejects disabled or malformed enabled=%s', async enabled => {
    state.rows = [{ user_id: 'staff-user', role: 'admin', enabled }];
    await expect(requireAdmin(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('allows a separate active grant after a disabled first row', async () => {
    state.rows = [{ user_id: 'staff-user', role: 'admin', enabled: false }, { user_id: 'staff-user', role: 'owner', enabled: true }];
    await expect(requireAdmin(request())).resolves.toBe('staff-user');
  });
  it('does not borrow another account’s grant or moderator privileges', async () => {
    state.rows = [{ user_id: 'other-user', role: 'admin', enabled: true }, { user_id: 'staff-user', role: 'moderator', enabled: true }];
    await expect(requireAdmin(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
