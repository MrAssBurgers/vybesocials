import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ uid: 'alice', profile: 'profile-alice', epoch: 1, listeners: new Set<() => void>(), account: { uid: 'alice', epoch: 1 }, error: false, rpc: vi.fn(), save: vi.fn(), success: vi.fn(), failure: vi.fn(), retry: vi.fn(), verify: vi.fn(), proof: vi.fn() }));
vi.mock('@/lib/auth', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useAuth: () => {
    useSyncExternalStore(fn => { state.listeners.add(fn); return () => state.listeners.delete(fn); }, () => `${state.uid}:${state.profile}:${state.epoch}`);
    return { user: { id: state.uid }, profile: { id: state.profile, user_id: state.uid } };
  } };
});
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => { if (state.account.uid !== state.uid || state.account.epoch !== state.epoch) state.account = { uid: state.uid, epoch: state.epoch }; return state.account; }, reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); } }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: () => ({ single: () => state.rpc() }) } }));
vi.mock('@/hooks/useSafetySettings', () => ({ useSafetySettings: () => ({ data: state.error ? undefined : { muted_keywords: [], content_filter_level: 'moderate' }, isLoading: false, isError: state.error, refetch: state.retry }),
  useUpdateSafetySettings: (proof: unknown) => { state.proof(proof); return { mutateAsync: state.save, isPending: false }; }, canAccessMinimalFiltering: (dob: string) => dob === '1990-01-01' }));
vi.mock('@/hooks/useParentalControls', () => ({ useVerifyParentalPin: () => ({ mutateAsync: state.verify, isPending: false }) }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.failure } }));
// Exercise the panel's option admission and dispatch without Radix portal gestures.
vi.mock('@/components/ui/select', () => ({ Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <select value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, disabled }: { value: string; disabled?: boolean }) => <option value={value} disabled={disabled}>{value}</option> }));
import { SafetySettingsPanel } from './SafetySettingsPanel';
beforeEach(() => { state.uid = 'alice'; state.profile = 'profile-alice'; state.epoch = 1; state.error = false; state.rpc.mockReset().mockResolvedValue({ data: { user_id: 'profile-alice', date_of_birth: '1990-01-01' }, error: null }); state.save.mockReset().mockResolvedValue({}); state.success.mockClear(); state.failure.mockClear(); state.retry.mockClear(); });
afterEach(cleanup);
const minimal = () => screen.getByRole('option', { name: 'minimal' });
const readyAdult = async () => { render(<SafetySettingsPanel />); await waitFor(() => expect(minimal()).toBeEnabled()); };
describe('safety panel reliable loading and account retirement', () => {
  it('offers retry instead of editable defaults after settings fail', () => {
    state.error = true; render(<SafetySettingsPanel />); expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(state.retry).toHaveBeenCalledOnce();
  });
  it('removes adult access and keyword draft when the account changes', async () => {
    await readyAdult(); fireEvent.change(screen.getByPlaceholderText('Add a keyword...'), { target: { value: 'private-draft' } });
    state.rpc.mockReturnValue(new Promise(() => {})); state.uid = 'bob'; state.profile = 'profile-bob'; state.epoch = 2; act(() => { for (const notify of state.listeners) notify(); });
    expect(minimal()).toBeDisabled(); expect(screen.getByPlaceholderText('Add a keyword...')).toHaveValue('');
  });
  it('does not revive old adult access when a profile returns without an Auth epoch change', async () => {
    await readyAdult(); state.rpc.mockReturnValue(new Promise(() => {}));
    state.profile = 'profile-other'; act(() => { for (const notify of state.listeners) notify(); });
    expect(minimal()).toBeDisabled();
    state.profile = 'profile-alice'; act(() => { for (const notify of state.listeners) notify(); });
    expect(minimal()).toBeDisabled();
  });
  it('ignores a late adult response after the same UID returns in a new epoch', async () => {
    let resolve!: (value: unknown) => void; state.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockReturnValue(new Promise(() => {}));
    render(<SafetySettingsPanel />); state.epoch = 2; act(() => { for (const notify of state.listeners) notify(); });
    await act(async () => { resolve({ data: { user_id: 'profile-alice', date_of_birth: '1990-01-01' }, error: null }); }); expect(minimal()).toBeDisabled();
  });
  it('keeps adult-only options disabled when the sensitive read rejects or belongs to another profile', async () => {
    state.rpc.mockRejectedValueOnce(new Error('Offline')); render(<SafetySettingsPanel />);
    await act(async () => { await Promise.resolve(); }); expect(minimal()).toBeDisabled();
    state.epoch = 2; state.rpc.mockResolvedValue({ data: { user_id: 'profile-bob', date_of_birth: '1990-01-01' }, error: null }); act(() => { for (const notify of state.listeners) notify(); });
    await act(async () => { await Promise.resolve(); }); expect(minimal()).toBeDisabled();
  });
  it('keeps a keyword draft retryable when its save fails', async () => {
    state.save.mockRejectedValueOnce(new Error('Offline')); await readyAdult(); fireEvent.change(screen.getByPlaceholderText('Add a keyword...'), { target: { value: 'spam' } });
    await act(async () => { fireEvent.keyDown(screen.getByPlaceholderText('Add a keyword...'), { key: 'Enter' }); });
    expect(screen.getByPlaceholderText('Add a keyword...')).toHaveValue('spam'); expect(state.success).not.toHaveBeenCalled();
    await act(async () => { fireEvent.keyDown(screen.getByPlaceholderText('Add a keyword...'), { key: 'Enter' }); });
    expect(state.save).toHaveBeenCalledTimes(2); expect(screen.getByPlaceholderText('Add a keyword...')).toHaveValue('');
  });
  it('does not announce a late save for the retired account or erase the new draft', async () => {
    let resolve!: (value: unknown) => void; state.save.mockImplementationOnce(() => new Promise(done => { resolve = done; })); await readyAdult();
    fireEvent.change(screen.getByPlaceholderText('Add a keyword...'), { target: { value: 'old' } }); fireEvent.keyDown(screen.getByPlaceholderText('Add a keyword...'), { key: 'Enter' });
    state.uid = 'bob'; state.profile = 'profile-bob'; state.epoch = 2; act(() => { for (const notify of state.listeners) notify(); }); fireEvent.change(screen.getByPlaceholderText('Add a keyword...'), { target: { value: 'new' } });
    await act(async () => { resolve({}); }); expect(state.success).not.toHaveBeenCalled(); expect(screen.getByPlaceholderText('Add a keyword...')).toHaveValue('new');
  });
  it('prevents overlapping saves while confirmation is pending', async () => {
    let resolve!: (value: unknown) => void; state.save.mockImplementation(() => new Promise(done => { resolve = done; })); await readyAdult();
    const messages = screen.getAllByRole('combobox')[1];
    fireEvent.change(messages, { target: { value: 'everyone' } });
    fireEvent.change(messages, { target: { value: 'nobody' } });
    expect(state.save).toHaveBeenCalledOnce(); expect(messages).toBeDisabled();
    await act(async () => { resolve({}); }); expect(messages).toBeEnabled();
  });
  it('does not announce save success after the panel is unmounted', async () => {
    let resolve!: (value: unknown) => void; state.save.mockImplementation(() => new Promise(done => { resolve = done; })); const view = render(<SafetySettingsPanel />);
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'nobody' } }); view.unmount();
    await act(async () => { resolve({}); }); expect(state.success).not.toHaveBeenCalled();
  });

});


describe('protected safety settings unlock', () => {
  it('retains a failed keyword draft and sends verified PIN proof only after unlocking', async () => {
    state.verify.mockResolvedValue(true); state.proof.mockClear();
    state.save.mockRejectedValueOnce({ code: 'functions/permission-denied', details: { reason: 'parental-pin-required' } }).mockResolvedValue({});
    render(<SafetySettingsPanel />);
    const keyword = screen.getByPlaceholderText('Add a keyword...');
    fireEvent.change(keyword, { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add keyword' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock Safety Settings' })).toBeInTheDocument());
    expect(keyword).toHaveValue('keep me');
    fireEvent.change(screen.getByLabelText('Parental PIN for safety settings'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Safety Settings' }));
    await waitFor(() => expect(state.proof).toHaveBeenLastCalledWith({ pin: '1234', uid: 'alice', epoch: 1 }));
    expect(state.save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Add keyword' }));
    await waitFor(() => expect(keyword).toHaveValue(''));
  });
});


it('retires a delayed safety unlock when the profile changes and returns', async () => {
  let resolve!: (value: boolean) => void; state.verify.mockImplementation(() => new Promise(done => { resolve = done; })); state.proof.mockClear();
  state.save.mockRejectedValueOnce({ details: { reason: 'parental-pin-required' } }); render(<SafetySettingsPanel />);
  fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'nobody' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock Safety Settings' })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Parental PIN for safety settings'), { target: { value: '1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock Safety Settings' }));
  state.profile = 'profile-other'; act(() => { for (const notify of state.listeners) notify(); });
  state.profile = 'profile-alice'; act(() => { for (const notify of state.listeners) notify(); });
  await act(async () => resolve(true)); expect(state.proof).toHaveBeenLastCalledWith(null);
  expect(screen.queryByRole('button', { name: 'Unlock Safety Settings' })).not.toBeInTheDocument();
});
