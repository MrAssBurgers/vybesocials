import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), social: vi.fn() }));
vi.mock('./functionsService', () => ({
  invokeFunction: mocks.invoke,
  isNotYetPortedPayload: (data: unknown) => Boolean(data && typeof data === 'object' && 'error' in data && data.error === 'not_yet_ported'),
}));
vi.mock('./socialRpc', () => ({ isSocialRpc: (name: string) => name === 'edit_message', runSocialRpc: mocks.social }));
import { createDataClient } from './dataClient';

describe('RPC errors reach callers instead of reporting false success', () => {
  const db = createDataClient();
  beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  it('keeps a missing backend error for data-clearing actions', async () => {
    const error = { name: 'not-found', message: 'Function unavailable' };
    mocks.invoke.mockResolvedValue({ data: null, error });
    expect(await db.rpc('clear_dna_adaptation_data')).toEqual({ data: null, error });
  });
  it('treats a placeholder response as unavailable', async () => {
    mocks.invoke.mockResolvedValue({ data: { error: 'not_yet_ported' }, error: null });
    expect((await db.rpc('set_active_background', { p_background_id: 'test' }).single()).error).toMatchObject({ code: 'unavailable' });
  });
  it('keeps transport failures on the compatibility promise', async () => {
    mocks.invoke.mockRejectedValue(new Error('Connection interrupted'));
    expect(await db.rpc('use_theme_code').maybeSingle()).toEqual({ data: null, error: { message: 'Connection interrupted' } });
  });
  it('does not treat failed social edits as saved', async () => {
    mocks.social.mockRejectedValue(new Error('Message was removed'));
    expect(await db.rpc('edit_message')).toEqual({ data: null, error: { message: 'Message was removed' } });
  });
  it('does not list every profile when a public member count is requested', async () => {
    const result = await db.rpc('get_public_user_count');
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: 'unavailable' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('keeps legitimate null and data successes unchanged', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { id: 'theme' }, error: null });
    expect(await db.rpc('get_shared_theme_by_id')).toEqual({ data: null, error: null });
    expect(await db.rpc('get_shared_theme_by_id')).toEqual({ data: { id: 'theme' }, error: null });
  });
});
