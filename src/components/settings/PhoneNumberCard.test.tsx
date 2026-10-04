import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), uid: 'alice', epoch: 1, profileOwner: 'alice', success: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, profile: { id: `${mock.uid}-profile`, user_id: mock.profileOwner } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: mock.uid, epoch: mock.epoch }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = mock.epoch; return () => { if (mock.uid !== uid || mock.epoch !== epoch) throw new Error('Account changed'); }; } }));
vi.mock('sonner', () => ({ toast: { success: mock.success } }));
vi.mock('@/components/ui/input-otp', () => ({
  InputOTP: ({ value, onChange, disabled, 'aria-label': label }: { value: string; onChange: (value: string) => void; disabled: boolean; 'aria-label': string }) => <input aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />,
  InputOTPGroup: () => null, InputOTPSlot: () => null,
}));
import { PhoneNumberCard } from './PhoneNumberCard';
const uuid = '11111111-1111-4111-8111-111111111111';
const receipt = (fields: object, uid = mock.uid) => ({ data: { ok: true, ownerUid: uid, profileId: `${uid}-profile`, ...fields }, error: null });
const status = () => receipt({ verified: false, maskedPhone: null, legacyPhoneNeedsVerification: false });
const sent = (uid = mock.uid, suffix = '0100') => receipt({ challengeId: uuid, maskedPhone: `+•••${suffix}`, expiresAt: Date.now() + 600000 }, uid);
const verified = () => receipt({ phone: '+13125550100', verified: true });
const calls = (name: string) => mock.invoke.mock.calls.filter(call => call[0] === name);
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
async function enterPhone(phone = '(312) 555-0100') {
  fireEvent.click(await screen.findByRole('button', { name: 'Add phone number' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Phone number' }), { target: { value: phone } });
}
async function enterCode() {
  await enterPhone(); fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
  const input = await screen.findByRole('textbox', { name: 'Verification code' });
  fireEvent.change(input, { target: { value: '123456' } });
}
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'alice'; mock.profileOwner = 'alice'; mock.epoch++;
  mock.invoke.mockReset().mockImplementation((name: string) => Promise.resolve(name === 'phoneVerificationState' ? status() : name === 'phoneVerifyRequest' ? sent() : verified()));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('phone verification truthful lifecycle', () => {
  it('shows failed state with retry rather than an unverified empty default', async () => {
    mock.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Phone status unavailable' } }); render(<PhoneNumberCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Phone status unavailable');
    expect(screen.queryByRole('button', { name: 'Add phone number' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry phone status' }));
    expect(await screen.findByRole('button', { name: 'Add phone number' })).toBeEnabled();
  });
  it('rejects letters and extensions before sending any verification request', async () => {
    render(<PhoneNumberCard />); await enterPhone('+13125550100 ext 2');
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(screen.getByRole('alert')).toHaveTextContent('do not include letters or extensions'); expect(calls('phoneVerifyRequest')).toHaveLength(0);
  });
  it('retains a failed number and stable request identity, without false code-sent feedback', async () => {
    render(<PhoneNumberCard />); await enterPhone(); mock.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' })); await screen.findByRole('alert');
    expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveValue('(312) 555-0100');
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument(); expect(mock.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry sending' })); await screen.findByLabelText('Verification code');
    expect(calls('phoneVerifyRequest')[0][1]).toEqual(calls('phoneVerifyRequest')[1][1]);
    expect(mock.success).toHaveBeenCalledWith('Verification code sent');
    expect(JSON.stringify(mock.success.mock.calls)).not.toContain('312');
  });
  it('preserves code and exact recent-sign-in guidance after confirmation fails', async () => {
    const onVerified = vi.fn(); render(<PhoneNumberCard onVerified={onVerified} />); await enterCode();
    mock.invoke.mockResolvedValueOnce({ data: null, error: { code: 'failed-precondition', message: 'Sign out and sign in again, then retry.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign out and sign in again, then retry.');
    expect(screen.getByLabelText('Verification code')).toHaveValue('123456'); expect(onVerified).not.toHaveBeenCalled();
  });
  it('publishes only checked completion and an event without phone data', async () => {
    const onVerified = vi.fn(), event = vi.fn(); window.addEventListener('vybe-phone-verified', event);
    render(<PhoneNumberCard onVerified={onVerified} />); await enterCode();
    mock.invoke.mockResolvedValueOnce(receipt({ phone: '+13125550101', verified: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' })); await screen.findByRole('alert');
    expect(onVerified).not.toHaveBeenCalled(); expect(event).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('+13125550100'));
    expect(screen.getByText('Verified · +•••0100')).toBeInTheDocument(); expect(event).toHaveBeenCalledTimes(1);
    expect(event.mock.calls[0][0]).not.toHaveProperty('detail'); expect(mock.success).toHaveBeenLastCalledWith('Phone verified');
    window.removeEventListener('vybe-phone-verified', event);
  });
  it.each(['cancel', 'account', 'unmount'])('ignores a late sent-code result after %s', async mode => {
    const request = deferred<unknown>(); const view = render(<PhoneNumberCard />); await enterPhone();
    mock.invoke.mockReturnValueOnce(request.promise); fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    if (mode === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    if (mode === 'account') { mock.uid = 'bob'; mock.profileOwner = 'bob'; mock.epoch++; view.rerender(<PhoneNumberCard />); }
    if (mode === 'unmount') view.unmount();
    await act(async () => { request.resolve(sent('alice')); });
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument(); expect(mock.success).not.toHaveBeenCalled();
  });
  it('suppresses late confirmation across an away-and-back account change', async () => {
    const onVerified = vi.fn(), confirmation = deferred<unknown>(); const view = render(<PhoneNumberCard onVerified={onVerified} />); await enterCode();
    mock.success.mockClear(); mock.invoke.mockReturnValueOnce(confirmation.promise); fireEvent.click(screen.getByRole('button', { name: 'Verify phone' }));
    mock.uid = 'bob'; mock.epoch++; mock.uid = 'alice'; mock.epoch++; view.rerender(<PhoneNumberCard onVerified={onVerified} />);
    await act(async () => { confirmation.resolve(verified()); });
    expect(onVerified).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  });
  it.each(['cancel', 'change', 'unmount'])('does not publish confirmation after the verification view is closed by %s', async mode => {
    const onVerified = vi.fn(), confirmation = deferred<unknown>(); const view = render(<PhoneNumberCard onVerified={onVerified} />); await enterCode();
    mock.success.mockClear(); mock.invoke.mockReturnValueOnce(confirmation.promise); fireEvent.click(screen.getByRole('button', { name: 'Verify phone' }));
    if (mode === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    if (mode === 'change') fireEvent.click(screen.getByRole('button', { name: 'Change number' }));
    if (mode === 'unmount') view.unmount();
    await act(async () => { confirmation.resolve(verified()); });
    expect(onVerified).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
    if (mode === 'change') expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveValue('(312) 555-0100');
  });
  it('waits for a matching profile and never displays an old account phone', async () => {
    mock.invoke.mockResolvedValueOnce(receipt({ verified: true, maskedPhone: '+•••0100', legacyPhoneNeedsVerification: false }));
    const view = render(<PhoneNumberCard />); await screen.findByText('Verified · +•••0100');
    mock.uid = 'bob'; mock.epoch++; view.rerender(<PhoneNumberCard />);
    expect(screen.queryByText('Verified · +•••0100')).not.toBeInTheDocument(); expect(screen.getByRole('status')).toHaveTextContent('Waiting for your signed-in profile');
    expect(mock.invoke).toHaveBeenCalledTimes(1);
  });
  it('allocates a new send identity only for an explicit resend or different phone', async () => {
    vi.useFakeTimers();
    await act(async () => { render(<PhoneNumberCard />); });
    fireEvent.click(screen.getByRole('button', { name: 'Add phone number' })); fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+13125550100' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    await act(async () => { vi.advanceTimersByTime(61000); });
    mock.invoke.mockResolvedValueOnce({ data: null, error: { message: 'SMS temporarily unavailable' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resend code' })); });
    const first = calls('phoneVerifyRequest')[0][1].requestId, resend = calls('phoneVerifyRequest')[1][1].requestId;
    expect(resend).not.toBe(first);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry sending' })); });
    expect(calls('phoneVerifyRequest')[2][1].requestId).toBe(resend);
    fireEvent.click(screen.getByRole('button', { name: 'Change number' })); fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+13125550101' } });
    mock.invoke.mockResolvedValueOnce(sent('alice', '0101'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    expect(calls('phoneVerifyRequest')[3][1].requestId).not.toBe(resend);
  });
  it('lets the server reconcile a previously completed confirmation after the visible code expires', async () => {
    vi.useFakeTimers(); const onVerified = vi.fn();
    await act(async () => { render(<PhoneNumberCard onVerified={onVerified} />); });
    fireEvent.click(screen.getByRole('button', { name: 'Add phone number' })); fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+13125550100' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    await act(async () => { vi.advanceTimersByTime(600001); });
    expect(screen.getByRole('button', { name: 'Retry verification' })).toBeEnabled();
    expect(screen.getByText(/If you already submitted it/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry verification' })); });
    expect(calls('phoneVerifyConfirm')).toHaveLength(1); expect(onVerified).toHaveBeenCalledWith('+13125550100');
    expect(screen.getByText('Verified · +•••0100')).toBeInTheDocument();
  });
  it('keeps the code draft and recent-sign-in guidance while reading actual masked account status', async () => {
    const onVerified = vi.fn(); render(<PhoneNumberCard onVerified={onVerified} />); await enterCode(); mock.success.mockClear();
    mock.invoke.mockResolvedValueOnce({ data: null, error: { message: 'For your security, sign out and sign in again before verifying your phone.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' })); await screen.findByRole('alert');
    const response = deferred<unknown>(); mock.invoke.mockReturnValueOnce(response.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh phone status' }));
    expect(screen.getByLabelText('Verification code')).toHaveValue('123456');
    expect(screen.getByText('Checking phone status…')).toBeInTheDocument();
    // Last-four matching does not prove it is the same full number. Status alone
    // must never satisfy an embedded verification gate or call onVerified.
    await act(async () => { response.resolve(receipt({ verified: true, maskedPhone: '+•••0100', legacyPhoneNeedsVerification: false })); });
    expect(screen.getByText('Current account phone is verified · +•••0100')).toBeInTheDocument();
    expect(screen.getByLabelText('Verification code')).toHaveValue('123456');
    expect(screen.getByRole('alert')).toHaveTextContent('sign out and sign in again');
    expect(onVerified).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
  });
  it('retains a failed status refresh and its draft with a read-only retry', async () => {
    render(<PhoneNumberCard />); await enterCode();
    mock.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Status could not load' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh phone status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Status could not load');
    expect(screen.getByLabelText('Verification code')).toHaveValue('123456');
    expect(screen.getByRole('button', { name: 'Verify phone' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry phone status' }));
    await waitFor(() => expect(screen.queryByText('Status could not load')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Verification code')).toHaveValue('123456'); expect(calls('phoneVerifyRequest')).toHaveLength(1);
  });
  it('does not let a late status read downgrade an exact confirmed phone receipt', async () => {
    const onVerified = vi.fn(); render(<PhoneNumberCard onVerified={onVerified} />); await enterCode();
    const response = deferred<unknown>(); mock.invoke.mockReturnValueOnce(response.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh phone status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('+13125550100'));
    await act(async () => { response.resolve(status()); });
    expect(screen.getByText('Verified · +•••0100')).toBeInTheDocument();
    expect(screen.queryByText('Checking phone status…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add phone number' })).not.toBeInTheDocument();
  });
  it('can read current account status after cancelling an ambiguous confirmation without claiming that request completed', async () => {
    const onVerified = vi.fn(), confirmation = deferred<unknown>(); render(<PhoneNumberCard onVerified={onVerified} />); await enterCode();
    mock.success.mockClear(); mock.invoke.mockReturnValueOnce(confirmation.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    mock.invoke.mockResolvedValueOnce(receipt({ verified: true, maskedPhone: '+•••0100', legacyPhoneNeedsVerification: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh phone status' })); await screen.findByText('Verified · +•••0100');
    await act(async () => { confirmation.resolve(verified()); });
    expect(onVerified).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
    expect(screen.getByText('Verified · +•••0100')).toBeInTheDocument();
  });
});
