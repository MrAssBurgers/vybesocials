import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  account: { uid: 'alice', epoch: 1 }, listeners: new Set<() => void>(), error: false, safetyError: false,
  verify: vi.fn(), update: vi.fn(), proof: vi.fn(), refetch: vi.fn(), safety: vi.fn(), refetchSafety: vi.fn(),
}));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.account,
  reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); } }));
vi.mock('@/lib/haptics', () => ({ haptics: { tap: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useParentalControls', () => ({
  useParentalControls: () => ({ data: state.error ? undefined : { has_pin: true, is_active: true, max_screen_time_minutes: 120 }, isError: state.error, refetch: state.refetch, isLoading: false }),
  useSetupParentalControls: () => ({ mutate: vi.fn() }),
  useUpdateParentalControls: (proof: unknown) => { state.proof(proof); return { mutate: state.update }; },
  useVerifyParentalPin: () => ({ mutateAsync: state.verify, isPending: false }),
}));
vi.mock('@/hooks/useSafetySettings', () => ({ useSafetySettings: () => ({ data: {}, isError: state.safetyError, refetch: state.refetchSafety }), useUpdateSafetySettings: () => ({ mutate: state.safety }) }));
vi.mock('@/hooks/useScreenTime', () => ({ useTodayScreenTime: () => ({ data: 0 }), formatScreenTime: () => '0 minutes' }));
// Check the section's drag/commit wiring independently of Radix's gesture implementation.
vi.mock('@/components/ui/slider', () => ({ Slider: ({ value, onValueChange, onValueCommit }: { value: number[]; onValueChange: (v: number[]) => void; onValueCommit: (v: number[]) => void }) =>
  <input aria-label="Daily limit" type="range" value={value[0]} onChange={e => onValueChange([Number(e.target.value)])} onMouseUp={e => onValueCommit([Number(e.currentTarget.value)])} /> }));
import { ParentalControlsSection } from './ParentalControlsSection';
beforeEach(() => { state.account = { uid: 'alice', epoch: 1 }; state.error = false; state.safetyError = false; state.safety.mockClear(); state.refetchSafety.mockClear(); state.verify.mockReset().mockResolvedValue(true); state.update.mockClear(); state.proof.mockClear(); state.refetch.mockClear(); });
afterEach(cleanup);
const unlock = async (pin = '1234') => {
  fireEvent.change(screen.getByLabelText('Parental PIN, four to eight digits'), { target: { value: pin } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock Controls' }));
  await waitFor(() => expect(screen.getByText('Controls Active')).toBeInTheDocument());
};
describe('parental section loading, PIN length and account retirement', () => {
  it('does not show first setup when the existing controls request failed', () => {
    state.error = true; render(<ParentalControlsSection />);
    expect(screen.queryByRole('button', { name: 'Enable Parental Controls' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(state.refetch).toHaveBeenCalledOnce();
  });
  it('does not offer editable defaults when safety settings failed to load', () => {
    state.safetyError = true; render(<ParentalControlsSection />);
    expect(screen.queryByLabelText('Parental PIN, four to eight digits')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(state.refetchSafety).toHaveBeenCalledOnce();
  });
  it('waits for a successful PIN-authorized filter change before updating safety settings', async () => {
    render(<ParentalControlsSection />); await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'moderate' }));
    expect(state.safety).not.toHaveBeenCalled();
    const callbacks = state.update.mock.calls[0][1]; callbacks.onSuccess();
    expect(state.safety).toHaveBeenCalledExactlyOnceWith({ content_filter_level: 'moderate' });
  });
  it('ignores a successful filter change after the account is retired', async () => {
    render(<ParentalControlsSection />); await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'moderate' }));
    const callbacks = state.update.mock.calls[0][1];
    await act(async () => { state.account = { uid: 'bob', epoch: 2 }; for (const notify of state.listeners) notify(); });
    callbacks.onSuccess(); expect(state.safety).not.toHaveBeenCalled();
  });
  it('accepts an existing eight-digit PIN and retires the proof after an account epoch change', async () => {
    render(<ParentalControlsSection />); await unlock('12345678');
    expect(state.proof).toHaveBeenLastCalledWith({ pin: '12345678', uid: 'alice', epoch: 1 });
    await act(async () => { state.account = { uid: 'alice', epoch: 2 }; for (const notify of state.listeners) notify(); });
    expect(screen.queryByText('Controls Active')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Parental PIN, four to eight digits')).toHaveValue('');
    expect(state.proof).toHaveBeenLastCalledWith(null);
  });
  it('previews slider changes locally and sends only the committed value', async () => {
    render(<ParentalControlsSection />); await unlock();
    const slider = screen.getByLabelText('Daily limit');
    fireEvent.change(slider, { target: { value: 60 } }); fireEvent.change(slider, { target: { value: 75 } });
    expect(state.update).not.toHaveBeenCalled();
    fireEvent.mouseUp(slider);
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ max_screen_time_minutes: 75 }, expect.objectContaining({ onError: expect.any(Function) }));
  });
  it('does not retain a late PIN proof after another account is shown', async () => {
    let resolve!: (value: boolean) => void; state.verify.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<ParentalControlsSection />);
    fireEvent.change(screen.getByLabelText('Parental PIN, four to eight digits'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Controls' }));
    await act(async () => { state.account = { uid: 'bob', epoch: 2 }; for (const notify of state.listeners) notify(); });
    await act(async () => { resolve(true); });
    expect(state.proof).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText('Controls Active')).not.toBeInTheDocument();
  });
});
