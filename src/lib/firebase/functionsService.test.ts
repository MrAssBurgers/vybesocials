import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => mocks.call }));
vi.mock('./app', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('./config', () => ({ getFirebaseConfig: () => ({ functionsRegion: 'us-central1' }) }));
vi.mock('./authService', () => ({ firebaseAuth: {} }));
import { invokeFunction } from './functionsService';

describe('callable result classification', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([{ ok: false }, { ok: false, error: 'expired' }, { ok: false, skipped: 'daily_cap' }])('preserves a supported domain rejection %j', async data => {
    mocks.call.mockResolvedValue({ data });
    expect(await invokeFunction('test-domain')).toEqual({ data, error: null });
  });
  it('reports explicitly unfinished endpoints as errors', async () => {
    mocks.call.mockResolvedValue({ data: { ok: false, error: 'not_yet_ported' } });
    expect(await invokeFunction('test-pending')).toEqual({ data: null, error: { name: 'not_yet_ported', message: 'not_yet_ported' } });
  });
  it('preserves permission rejection without reporting success', async () => {
    mocks.call.mockRejectedValue({ code: 'functions/permission-denied', message: 'Not allowed' });
    expect(await invokeFunction('test-auth')).toEqual({ data: null, error: { name: 'permission-denied', message: 'Not allowed' } });
  });
});
