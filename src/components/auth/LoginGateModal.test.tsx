import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: mock.invoke }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() } }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocumentFromServer: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: mock.error } }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock('@/components/ui/input-otp', () => ({
  InputOTP: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) => <input aria-label="Code" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />,
  InputOTPGroup: () => null, InputOTPSlot: () => null,
}));
import { LoginGateModal } from './LoginGateModal';
const props = () => ({ open: true, mode: 'code' as const, email: 'a***@example.test', challengeId: 'challenge-one', expiresAt: new Date(Date.now() + 600_000).toISOString(), onSuccess: vi.fn(), onCancel: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); mock.invoke.mockResolvedValue({ data: { ok: true }, error: null }); });
afterEach(cleanup);
it('retries completion after an accepted code without verifying the one-use code again', async () => {
  mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'synthetic-token' }, error: null });
  const p = props(); p.onSuccess.mockRejectedValueOnce(new Error('Profile unavailable')).mockResolvedValue(undefined);
  render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish signing in' })).toBeEnabled());
  expect(screen.getByText(/Code accepted/)).toBeInTheDocument();
  expect(p.onSuccess).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Finish signing in' }));
  await waitFor(() => expect(p.onSuccess).toHaveBeenCalledTimes(2));
  expect(mock.invoke).toHaveBeenCalledTimes(1);
  expect(p.onSuccess.mock.calls[1][1]).toBe('synthetic-token');
});
it('drops an accepted receipt when the sign-in view changes', async () => {
  mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'synthetic-token' }, error: null });
  const p = props(); p.onSuccess.mockRejectedValue(new Error('Profile unavailable'));
  const ui = render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish signing in' })).toBeEnabled());
  ui.rerender(<LoginGateModal {...p} challengeId="challenge-two" />);
  expect(screen.queryByRole('button', { name: 'Finish signing in' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Code')).toHaveValue('');
  expect(p.onSuccess).toHaveBeenCalledTimes(1);
});
it('does not reuse an expired accepted receipt', async () => {
  const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'synthetic-token' }, error: null });
    const p = props(); p.onSuccess.mockRejectedValue(new Error('Profile unavailable'));
    render(<LoginGateModal {...p} />);
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish signing in' })).toBeEnabled());
    clock.mockReturnValue(now + 600_001);
    fireEvent.click(screen.getByRole('button', { name: 'Finish signing in' }));
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('expired')));
    expect(p.onSuccess).toHaveBeenCalledTimes(1); expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Code')).toHaveValue('');
  } finally { clock.mockRestore(); }
});
it('keeps a completion retry single-flight and retires its guard on close', async () => {
  mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'synthetic-token' }, error: null });
  let finish!: () => void;
  const p = props(); p.onSuccess.mockRejectedValueOnce(new Error('Profile unavailable')).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const ui = render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  const button = await screen.findByRole('button', { name: 'Finish signing in' });
  await waitFor(() => expect(button).toBeEnabled());
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(p.onSuccess).toHaveBeenCalledTimes(2); expect(mock.invoke).toHaveBeenCalledTimes(1);
  const guard = p.onSuccess.mock.calls[1][3]; expect(guard).not.toThrow();
  ui.rerender(<LoginGateModal {...p} open={false} />); expect(guard).toThrow('view changed');
  mock.error.mockClear(); await act(async () => finish()); expect(mock.error).not.toHaveBeenCalled();
});
it('never completes sign-in from an empty success acknowledgement or loops auto-submit', async () => {
  const p = props(); render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('No sign-in receipt')));
  expect(p.onSuccess).not.toHaveBeenCalled(); expect(mock.invoke).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Code')).toHaveValue('');
});
it('completes from a real token receipt once', async () => {
  mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'synthetic-token' }, error: null });
  const p = props(); render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(p.onSuccess).toHaveBeenCalledWith(null, 'synthetic-token', { emailChallengeId: p.challengeId }, expect.any(Function)));
  expect(mock.invoke).toHaveBeenCalledTimes(1);
});
it('keeps controls busy through checked device registration and retires its callback on close', async () => {
  mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'synthetic-token' }, error: null });
  let finish!: () => void; const completion = new Promise<void>(resolve => { finish = resolve; });
  const p = props(); p.onSuccess.mockReturnValue(completion); const ui = render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(p.onSuccess).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: 'Use a different account' })).toBeDisabled();
  const guard = p.onSuccess.mock.calls[0][3]; expect(guard).not.toThrow();
  ui.rerender(<LoginGateModal {...p} open={false} />); expect(guard).toThrow('view changed');
  await act(async () => finish()); expect(mock.error).not.toHaveBeenCalled();
});
it('late verification cannot sign in after switching accounts away and back', async () => {
  let finish!: (value: unknown) => void; mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const p = props(), ui = render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1));
  ui.rerender(<LoginGateModal {...p} challengeId="challenge-two" />);
  ui.rerender(<LoginGateModal {...p} />);
  await act(async () => finish({ data: { ok: true, customToken: 'old-token' }, error: null }));
  expect(p.onSuccess).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
});
it('closing the modal suppresses late resend feedback', async () => {
  let finish!: (value: unknown) => void; mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const p = props(), ui = render(<LoginGateModal {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
  ui.rerender(<LoginGateModal {...p} open={false} />);
  await act(async () => finish({ data: { ok: true, challengeId: p.challengeId, expiresAt: p.expiresAt }, error: null }));
  expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
});
it('failed resend keeps a partial code and malformed acknowledgement never claims sent', async () => {
  render(<LoginGateModal {...props()} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
  await waitFor(() => expect(mock.error).toHaveBeenCalled());
  expect(mock.success).not.toHaveBeenCalled(); expect(screen.getByLabelText('Code')).toHaveValue('123');
});
it('provider failure is a service error and can retry without an automatic request loop', async () => {
  mock.invoke.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Verification unavailable' } });
  render(<LoginGateModal {...props()} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('unavailable')));
  expect(mock.invoke).toHaveBeenCalledTimes(1);
});
it('does not label a Firebase network failure as an invalid code', async () => {
  mock.invoke.mockResolvedValue({ data: null, error: { code: 'auth/network-request-failed' } });
  render(<LoginGateModal {...props()} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(mock.error).toHaveBeenCalledWith('Verification is unavailable — check your connection and try again'));
  expect(mock.invoke).toHaveBeenCalledTimes(1);
});
it('a failed deny does not dismiss the gate or report success', async () => {
  mock.invoke.mockImplementation((_name, request) => Promise.resolve(request.body.action === 'poll' ? { data: { status: 'pending' }, error: null } : { data: null, error: { code: 'unavailable' } }));
  const p = props(); render(<LoginGateModal {...p} mode="approval" />);
  fireEvent.click(screen.getByRole('button', { name: /wasn't me/i }));
  await waitFor(() => expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('could not be denied')));
  expect(p.onCancel).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
});
