import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn(), inputRenders: 0, broadcasts: new Set<(event: unknown) => void>() }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: mock.invoke }, channel: () => {
  let listener: (event: unknown) => void;
  return { on(_type: string, _filter: unknown, callback: typeof listener) { listener = callback; mock.broadcasts.add(listener); return this; }, subscribe() { return this; }, close() { mock.broadcasts.delete(listener); } };
}, removeChannel: (channel: { close: () => void }) => channel.close() } }));
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
  InputOTP: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) => { mock.inputRenders++; return <input aria-label="Code" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />; },
  InputOTPGroup: () => null, InputOTPSlot: () => null,
}));
import { LoginGateModal, LOGIN_CODE_WAIT_MS, LOGIN_CODE_RECOVERY_WAIT_MS } from './LoginGateModal';
const props = () => ({ open: true, mode: 'code' as const, email: 'a***@example.test', challengeId: 'challenge-one', expiresAt: new Date(Date.now() + 600_000).toISOString(), onSuccess: vi.fn(), onCancel: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); mock.invoke.mockReset(); mock.inputRenders = 0; mock.broadcasts.clear(); mock.invoke.mockResolvedValue({ data: { ok: true }, error: null }); });
afterEach(cleanup);

it.each(['approved', 'denied', 'expired'])('ignores a forged %s broadcast while the approval server is pending', async status => {
  let finish!: (value: unknown) => void;
  mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const p = props(); render(<LoginGateModal {...p} mode="approval" />);
  await act(async () => {
    for (const receive of mock.broadcasts) receive({ payload: { status, customToken: 'forged-token', session: { access_token: 'forged-access', refresh_token: 'forged-refresh' } } });
  });
  expect(p.onSuccess).not.toHaveBeenCalled(); expect(p.onCancel).not.toHaveBeenCalled();
  await act(async () => finish({ data: { status: 'approved', customToken: 'checked-token' }, error: null }));
  expect(p.onSuccess).toHaveBeenCalledExactlyOnceWith(null, 'checked-token', undefined, expect.any(Function));
  expect(p.onCancel).not.toHaveBeenCalled();
});

it('does not overlap one-use approval polls when visibility events arrive during a request', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (value: unknown) => void;
    mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const p = props(); render(<LoginGateModal {...p} mode="approval" />);
    await act(async () => { for (let i = 0; i < 5; i++) document.dispatchEvent(new Event('visibilitychange')); });
    expect(mock.invoke).toHaveBeenCalledOnce();
    await act(async () => finish({ data: { status: 'pending' }, error: null }));
    mock.invoke.mockResolvedValue({ data: { status: 'approved', customToken: 'checked-token' }, error: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mock.invoke).toHaveBeenCalledTimes(2); expect(p.onSuccess).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); document.dispatchEvent(new Event('visibilitychange')); });
    expect(mock.invoke).toHaveBeenCalledTimes(2); expect(p.onSuccess).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

it('retires a pending approval on challenge replacement and its completion guard on close', async () => {
  const pending: ((value: unknown) => void)[] = [];
  mock.invoke.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
  const p = props(), ui = render(<LoginGateModal {...p} mode="approval" />);
  ui.rerender(<LoginGateModal {...p} mode="approval" challengeId="next-challenge" />);
  await act(async () => { for (const finish of pending.slice(0, -1)) finish({ data: { status: 'approved', customToken: 'old-token' }, error: null }); });
  expect(p.onSuccess).not.toHaveBeenCalled(); expect(p.onCancel).not.toHaveBeenCalled();
  expect(mock.invoke.mock.lastCall?.[1].body.challengeId).toBe('next-challenge');
  expect(mock.invoke).toHaveBeenCalledTimes(2);
  await act(async () => pending.at(-1)!({ data: { status: 'approved', customToken: 'current-token' }, error: null }));
  expect(p.onSuccess).toHaveBeenCalledOnce();
  const guard = p.onSuccess.mock.calls[0][3]; expect(guard).not.toThrow();
  ui.rerender(<LoginGateModal {...p} mode="approval" challengeId="next-challenge" open={false} />);
  expect(guard).toThrow('This sign-in view changed.');
});

it('keeps one approval request through parent callback rerenders and uses the current completion callback', async () => {
  let finish!: (value: unknown) => void;
  mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const p = props(), ui = render(<LoginGateModal {...p} mode="approval" />);
  const onSuccess = vi.fn(), onCancel = vi.fn();
  ui.rerender(<LoginGateModal {...p} mode="approval" onSuccess={onSuccess} onCancel={onCancel} />);
  expect(mock.invoke).toHaveBeenCalledOnce();
  await act(async () => finish({ data: { status: 'approved', customToken: 'checked-token' }, error: null }));
  expect(onSuccess).toHaveBeenCalledExactlyOnceWith(null, 'checked-token', undefined, expect.any(Function));
  expect(p.onSuccess).not.toHaveBeenCalled(); expect(onCancel).not.toHaveBeenCalled();
});

it('pauses approval polling while hidden and resumes with the checked server result', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  try {
    visibility.mockReturnValue('visible');
    mock.invoke.mockResolvedValue({ data: { status: 'pending' }, error: null });
    const p = props(); render(<LoginGateModal {...p} mode="approval" />);
    await act(async () => {});
    visibility.mockReturnValue('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(5000); });
    expect(mock.invoke).toHaveBeenCalledOnce();
    visibility.mockReturnValue('visible');
    mock.invoke.mockResolvedValue({ data: { status: 'denied' }, error: null });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(mock.invoke).toHaveBeenCalledTimes(2); expect(p.onCancel).toHaveBeenCalledOnce(); expect(p.onSuccess).not.toHaveBeenCalled();
  } finally { visibility.mockRestore(); vi.useRealTimers(); }
});

it('rejects malformed approval credentials and keeps the bounded missing-credential recovery', async () => {
  vi.useFakeTimers();
  try {
    mock.invoke.mockResolvedValue({ data: { status: 'approved', customToken: { forged: true }, session: { access_token: true, refresh_token: 1 } }, error: null });
    const p = props(); render(<LoginGateModal {...p} mode="approval" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(p.onSuccess).not.toHaveBeenCalled(); expect(p.onCancel).toHaveBeenCalledOnce();
    expect(mock.invoke).toHaveBeenCalledTimes(5);
    expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('could not be completed'));
  } finally { vi.useRealTimers(); }
});

it('retries completion after an accepted code without verifying the one-use code again', async () => {
  mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'synthetic-token' }, error: null });
  const p = props(); p.onSuccess.mockRejectedValueOnce(new Error('Profile unavailable')).mockResolvedValue(undefined);
  render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish signing in' })).toBeEnabled());
  expect(screen.getByRole('alert')).toHaveTextContent('Code accepted');
  expect(p.onSuccess).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Finish signing in' }));
  await waitFor(() => expect(p.onSuccess).toHaveBeenCalledTimes(2));
  expect(mock.invoke).toHaveBeenCalledTimes(1);
  expect(p.onSuccess.mock.calls[1][1]).toBe('synthetic-token');
});
it('keeps a just-accepted receipt retryable after the original code expires', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  try {
    const now = Date.now(), p = { ...props(), expiresAt: new Date(now + 1_000).toISOString() };
    mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'accepted-near-expiry' }, error: null });
    p.onSuccess.mockRejectedValueOnce(Error('Temporary connection failure')).mockResolvedValue(undefined);
    render(<LoginGateModal {...p} />);
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    const retry = await screen.findByRole('button', { name: 'Finish signing in' });
    await waitFor(() => expect(retry).toBeEnabled());
    clock.mockReturnValue(now + 2_000); fireEvent.click(retry);
    await waitFor(() => expect(p.onSuccess).toHaveBeenCalledTimes(2));
    expect(mock.invoke).toHaveBeenCalledOnce(); expect(mock.error).not.toHaveBeenCalledWith(expect.stringContaining('expired'));
  } finally { clock.mockRestore(); }
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

it('automatically finishes delayed accepted-code completion without another verification or retry', async () => {
  vi.useFakeTimers();
  try {
    let finish!: () => void;
    mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'accepted-token' }, error: null });
    const p = props(); p.onSuccess.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    render(<LoginGateModal {...p} />);
    await act(async () => { fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(LOGIN_CODE_WAIT_MS); });
    expect(screen.getByRole('status')).toHaveTextContent('Your code was accepted');
    expect(document.querySelectorAll('.auth-wave-working')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Change account' })).toBeDisabled();
    expect(mock.invoke).toHaveBeenCalledOnce(); expect(p.onSuccess).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(screen.queryByRole('status')).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mock.invoke).toHaveBeenCalledOnce(); expect(p.onSuccess).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
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
  expect(screen.getByRole('button', { name: 'Change account' })).toBeDisabled();
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
it('retries a lost code-check response with the same private attempt key without asking for the code again', async () => {
  mock.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable' } })
    .mockResolvedValueOnce({ data: { ok: true, customToken: 'recovered-token' }, error: null });
  const p = props(); render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry code check' })).toBeEnabled());
  const first = mock.invoke.mock.calls[0][1].body;
  expect(first.verificationKey).toMatch(/^[a-f0-9]{64}$/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry code check' }));
  await waitFor(() => expect(p.onSuccess).toHaveBeenCalledOnce());
  expect(mock.invoke.mock.calls[1][1].body).toEqual(first);
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
});
it('releases a stalled email check for a same-attempt retry and ignores its late reply', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (value: unknown) => void;
    mock.invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ data: { ok: true, customToken: 'recovered-token' }, error: null });
    const p = props(); render(<LoginGateModal {...p} />);
    await act(async () => { fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } }); });
    const original = mock.invoke.mock.calls[0][1].body;
    await act(async () => { await vi.advanceTimersByTimeAsync(LOGIN_CODE_RECOVERY_WAIT_MS); });
    expect(screen.getByRole('button', { name: 'Retry code check' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('connection');
    expect(document.querySelectorAll('.auth-wave-working')).toHaveLength(0);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry code check' })); });
    expect(mock.invoke.mock.calls[1][1].body).toEqual(original);
    expect(p.onSuccess).toHaveBeenCalledOnce();
    await act(async () => finish({ data: { ok: true, customToken: 'late-original-token' }, error: null }));
    expect(p.onSuccess).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
it('preserves a recoverable attempt when sending a replacement code fails', async () => {
  mock.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable' } })
    .mockResolvedValueOnce({ data: null, error: { name: 'unavailable' } })
    .mockResolvedValueOnce({ data: { ok: true, customToken: 'original-receipt' }, error: null });
  const p = props(); render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await screen.findByRole('button', { name: 'Retry code check' });
  const original = mock.invoke.mock.calls[0][1].body;
  fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry code check' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Retry code check' }));
  await waitFor(() => expect(p.onSuccess).toHaveBeenCalledOnce());
  expect(mock.invoke.mock.calls[2][1].body).toEqual(original);
});
it('does not offer recovery for an incorrect code or carry its key into a replacement challenge', async () => {
  mock.invoke.mockResolvedValue({ data: null, error: { name: 'permission-denied' } });
  const p = props(), ui = render(<LoginGateModal {...p} />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(mock.error).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: 'Retry code check' })).toBeNull();
  const first = mock.invoke.mock.calls[0][1].body.verificationKey;
  ui.rerender(<LoginGateModal {...p} challengeId="replacement" />);
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
  await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(2));
  expect(mock.invoke.mock.calls[1][1].body.verificationKey).not.toBe(first);
});
it('a failed deny does not dismiss the gate or report success', async () => {
  mock.invoke.mockImplementation((_name, request) => Promise.resolve(request.body.action === 'poll' ? { data: { status: 'pending' }, error: null } : { data: null, error: { code: 'unavailable' } }));
  const p = props(); render(<LoginGateModal {...p} mode="approval" />);
  fireEvent.click(screen.getByRole('button', { name: /wasn't me/i }));
  await waitFor(() => expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('could not be denied')));
  expect(p.onCancel).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
});

it('automatically completes a delayed one-use check without another tap or submission', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (value: unknown) => void;
    mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const p = props(); render(<LoginGateModal {...p} />);
    await act(async () => { fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(LOGIN_CODE_WAIT_MS); });
    expect(screen.getByRole('status')).toHaveTextContent('automatically');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change account' })).toBeEnabled();
    expect(p.onSuccess).not.toHaveBeenCalled(); expect(mock.invoke).toHaveBeenCalledOnce();
    // The server response can arrive while the user is deciding to continue.
    await act(async () => finish({ data: { ok: true, customToken: 'synthetic-delayed-token' }, error: null }));
    expect(mock.invoke).toHaveBeenCalledOnce();
    expect(p.onSuccess).toHaveBeenCalledWith(null, 'synthetic-delayed-token', { emailChallengeId: p.challengeId }, expect.any(Function));
    expect(p.onSuccess).toHaveBeenCalledOnce();
    expect(mock.error).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it('ticks the expiry without rerendering the code input', async () => {
  vi.useFakeTimers();
  try {
    render(<LoginGateModal {...props()} />);
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123' } });
    const before = mock.inputRenders;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText('9:55')).toBeInTheDocument();
    expect(mock.inputRenders).toBe(before);
    expect(screen.getByLabelText('Code')).toHaveValue('123');
  } finally { vi.useRealTimers(); }
});

it('ignores a delayed result after closing and reopening the same challenge', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (value: unknown) => void;
    mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const p = props(), ui = render(<LoginGateModal {...p} />);
    await act(async () => { fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(LOGIN_CODE_WAIT_MS); });
    ui.rerender(<LoginGateModal {...p} open={false} />);
    ui.rerender(<LoginGateModal {...p} />);
    await act(async () => finish({ data: { ok: true, customToken: 'retired-token' }, error: null }));
    expect(p.onSuccess).not.toHaveBeenCalled();
    expect(mock.error).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Code')).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it('does not let a delayed verification complete a replacement challenge', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (value: unknown) => void;
    mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const p = props(), ui = render(<LoginGateModal {...p} />);
    await act(async () => { fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(LOGIN_CODE_WAIT_MS); });
    ui.rerender(<LoginGateModal {...p} challengeId="replacement-challenge" />);
    await act(async () => finish({ data: { ok: true, customToken: 'retired-token' }, error: null }));
    expect(screen.queryByRole('button', { name: 'Continue verification' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue(''); expect(p.onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it('shows the original delayed rejection inline and allows a corrected code', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (value: unknown) => void;
    mock.invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const p = props(); render(<LoginGateModal {...p} />);
    await act(async () => { fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(LOGIN_CODE_WAIT_MS); });
    await act(async () => finish({ data: null, error: { name: 'permission-denied' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect code');
    expect(screen.getByLabelText('Code')).toHaveValue(''); expect(mock.invoke).toHaveBeenCalledOnce();
    mock.invoke.mockResolvedValue({ data: { ok: true, customToken: 'corrected-token' }, error: null });
    await act(async () => { fireEvent.change(screen.getByLabelText('Code'), { target: { value: '654321' } }); });
    expect(mock.invoke).toHaveBeenCalledTimes(2); expect(p.onSuccess).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
