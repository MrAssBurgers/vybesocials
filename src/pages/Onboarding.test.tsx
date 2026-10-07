import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Onboarding from './Onboarding';

const state = vi.hoisted(() => ({
  uid: 'alice', epoch: 1,
  profile: { id: 'profile-alice', user_id: 'alice', username: 'alice', first_name: 'Test', last_name: 'Person', display_name: 'Test Person', onboarding_completed: false },
  ensure: vi.fn(), update: vi.fn(), legal: vi.fn(), birthday: vi.fn(), upload: vi.fn(), url: vi.fn(), refresh: vi.fn(),
  error: vi.fn(), success: vi.fn(), clearUsername: vi.fn(), clearApple: vi.fn(), order: [] as string[],
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid, user_metadata: {} }, profile: state.profile, refreshProfile: state.refresh, profileSetupError: null }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/lib/profileAccountGuard', () => ({ profileAccountGuard: (uid: string, extra?: () => void) => {
  const epoch = state.epoch;
  const guard = () => { extra?.(); if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); };
  guard(); return guard;
} }));
vi.mock('@/components/auth/AccountProfileStatus', () => ({ default: () => <p>Profile loading</p> }));
vi.mock('@/lib/firebase/users', () => ({ ensureUserProfile: (...args: unknown[]) => state.ensure(...args), updateUserProfile: (...args: unknown[]) => state.update(...args) }));
vi.mock('@/lib/firebase', () => ({ db: { storage: { from: () => ({ upload: (...args: unknown[]) => state.upload(...args) }) } }, firebaseStorage: { resolveDownloadUrl: (...args: unknown[]) => state.url(...args) } }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ batchSet: (...args: unknown[]) => state.legal(...args) }));
vi.mock('@/lib/profilePrivate', () => ({ savePrivateProfileDateOfBirth: (...args: unknown[]) => state.birthday(...args) }));
vi.mock('@/lib/username', async (importOriginal) => ({ ...await importOriginal<object>(), resolveSignupUsername: () => '', clearSignupUsername: () => state.clearUsername() }));
vi.mock('@/lib/appleNameCapture', () => ({ readAppleProvidedName: () => null, isAppleAuthUser: () => false, clearAppleProvidedName: () => state.clearApple() }));
vi.mock('@/lib/authReturnPath', () => ({ getPostLoginPath: () => '/home' }));
vi.mock('@/lib/nativePerfMode', () => ({ isNativePerfMode: () => true }));
vi.mock('@/lib/despiaBridge', () => ({ isIOSAppShell: () => false }));
vi.mock('@/lib/haptics', () => ({ haptics: { tap: vi.fn(), impact: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: state.error, success: state.success, info: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: () => 'Skip for now' }) }));
vi.mock('@/components/ui/VYBELogo', () => ({ VYBELogo: () => <span>VYBE</span> }));
vi.mock('@/components/ui/VybeMiniIcon', () => ({ VybeMiniIcon: () => null }));
vi.mock('@/components/onboarding/UsernameSetup', () => ({ UsernameSetup: () => <p>Choose username</p> }));
vi.mock('@/components/onboarding/AgeSetup', () => ({ AgeSetup: ({ onChange, onAgeCalculated }: { onChange: (date: Date) => void; onAgeCalculated: (age: number) => void }) => <div>
  <button onClick={() => { onChange(new Date('2000-01-02T00:00:00Z')); onAgeCalculated(26); }}>Set test birthday</button>
  <button onClick={() => { onChange(new Date('2018-01-02T00:00:00Z')); onAgeCalculated(8); }}>Set underage birthday</button>
</div> }));
vi.mock('@/components/onboarding/InterestPicker', () => ({ InterestPicker: ({ onChange }: { onChange: (values: string[]) => void }) => <button onClick={() => onChange(['art', 'games', 'music'])}>Choose interests</button> }));
vi.mock('@/components/onboarding/CreatorSuggestions', () => ({ CreatorSuggestions: () => null }));
vi.mock('@/components/onboarding/ProfileSetup', () => ({ ProfileSetup: ({ data, onChange }: { data: { bio: string }; onChange: (value: unknown) => void }) => <div>
  <input aria-label="Biography" value={data.bio} onChange={event => onChange({ ...data, bio: event.target.value })} />
  <button onClick={() => onChange({ ...data, avatarFile: new File(['photo'], 'avatar.png', { type: 'image/png' }) })}>Choose test photo</button>
</div> }));
vi.mock('@/components/onboarding/LegalAcceptance', () => ({ LegalAcceptance: ({ accepted, onChange }: { accepted: boolean; onChange: (value: boolean) => void }) => <label>Accept test terms<input type="checkbox" checked={accepted} onChange={event => onChange(event.target.checked)} /></label> }));
vi.mock('@/components/onboarding/AIVybeDesigner', () => ({ AIVybeDesigner: ({ onComplete }: { onComplete: () => void }) => <button onClick={onComplete}>Finish designer</button> }));

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
function show() { return render(<MemoryRouter><Routes><Route path="/home" element={<p>Home destination</p>} /><Route path="*" element={<Onboarding />} /></Routes></MemoryRouter>); }
async function completeSteps(photo = false) {
  fireEvent.click(screen.getByRole('button', { name: 'Set test birthday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose interests' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Biography' }), { target: { value: 'My retained draft' } });
  if (photo) fireEvent.click(screen.getByRole('button', { name: 'Choose test photo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Accept test terms' }));
}

beforeEach(() => {
  vi.clearAllMocks(); state.uid = 'alice'; state.epoch = 1; state.order = [];
  state.profile = { id: 'profile-alice', user_id: 'alice', username: 'alice', first_name: 'Test', last_name: 'Person', display_name: 'Test Person', onboarding_completed: false };
  state.refresh.mockImplementation(async () => state.profile);
  state.ensure.mockImplementation(async () => state.profile);
  state.update.mockImplementation(async () => { state.order.push('complete'); state.profile = { ...state.profile, onboarding_completed: true }; });
  state.legal.mockImplementation(async () => { state.order.push('legal'); });
  state.birthday.mockImplementation(async () => { state.order.push('birthday'); });
  state.upload.mockResolvedValue({ error: null }); state.url.mockResolvedValue('https://example.test/avatar.png');
});
afterEach(cleanup);

describe('account-bound onboarding persistence', () => {
  it('returns a confirmed existing account to Home without another bootstrap read', () => {
    state.profile.onboarding_completed = true; show();
    expect(screen.getByText('Home destination')).toBeInTheDocument();
    expect(state.refresh).not.toHaveBeenCalled(); expect(state.ensure).not.toHaveBeenCalled();
  });
  it('acknowledges photo, private birthday and legal records before completing the profile', async () => {
    show(); await completeSteps(true);
    fireEvent.click(screen.getByRole('button', { name: 'Design your VYBE' }));
    await screen.findByRole('button', { name: 'Finish designer' });
    expect(state.order).toEqual(['birthday', 'legal', 'complete']);
    expect(state.update).toHaveBeenCalledWith('alice', expect.objectContaining({ bio: 'My retained draft', avatar_url: 'https://example.test/avatar.png', onboarding_completed: true }), expect.any(Function));
    expect(state.legal).toHaveBeenCalledWith('legal_acceptances', [
      { id: 'alice_tos_2.0', data: { user_id: 'alice', document_type: 'tos', document_version: '2.0' } },
      { id: 'alice_privacy_2.0', data: { user_id: 'alice', document_type: 'privacy', document_version: '2.0' } },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Finish designer' }));
    await screen.findByText('Home destination');
  });
  it('retains choices and the uploaded photo when legal saving fails, then retries without reuploading', async () => {
    state.legal.mockRejectedValueOnce(new Error('Unavailable'));
    show(); await completeSteps(true);
    fireEvent.click(screen.getByRole('button', { name: 'Design your VYBE' }));
    await screen.findByRole('alert');
    expect(state.update).not.toHaveBeenCalled(); expect(state.clearUsername).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Accept test terms' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Design your VYBE' }));
    await screen.findByRole('button', { name: 'Finish designer' });
    expect(state.upload).toHaveBeenCalledOnce();
  });
  it('reports a failed photo instead of silently completing without it', async () => {
    state.upload.mockResolvedValueOnce({ error: { message: 'Unavailable' } });
    show(); await completeSteps(true);
    fireEvent.click(screen.getByRole('button', { name: 'Design your VYBE' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your photo could not be uploaded');
    expect(state.update).not.toHaveBeenCalled(); expect(state.legal).not.toHaveBeenCalled();
  });
  it('does not celebrate or navigate when the saved profile cannot be confirmed', async () => {
    show(); await completeSteps();
    state.refresh.mockResolvedValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Design your VYBE' }));
    await screen.findByRole('alert');
    expect(state.update).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Finish designer' })).not.toBeInTheDocument();
    expect(state.success).not.toHaveBeenCalled();
  });
  it('keeps the designer retryable when its final profile refresh fails', async () => {
    show(); await completeSteps();
    fireEvent.click(screen.getByRole('button', { name: 'Design your VYBE' }));
    await screen.findByRole('button', { name: 'Finish designer' });
    state.refresh.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Finish designer' }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Your profile could not be confirmed. Please try again.'));
    expect(state.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish designer' }));
    await screen.findByText('Home destination');
  });
  it.each(['ensure', 'upload', 'birthday', 'legal', 'update'] as const)('retires an account switch during %s without further writes or success', async stage => {
    const pending = deferred<unknown>(); state[stage].mockReturnValueOnce(pending.promise);
    const view = show(); await completeSteps(true);
    fireEvent.click(screen.getByRole('button', { name: 'Design your VYBE' }));
    await waitFor(() => expect(state[stage]).toHaveBeenCalledOnce());
    const updateCalls = state.update.mock.calls.length;
    state.uid = 'bob'; state.epoch = 2; state.profile = { ...state.profile, id: 'profile-bob', user_id: 'bob', username: 'bob' };
    view.rerender(<MemoryRouter><Onboarding /></MemoryRouter>);
    await act(async () => { pending.resolve(stage === 'ensure' ? { id: 'profile-alice', user_id: 'alice' } : stage === 'upload' ? { error: null } : undefined); });
    expect(state.update).toHaveBeenCalledTimes(updateCalls);
    expect(state.clearUsername).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Set test birthday' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish designer' })).not.toBeInTheDocument();
  });
  it('does not resume stale writes when the same account signs in again', async () => {
    const pending = deferred<unknown>(); state.ensure.mockReturnValueOnce(pending.promise);
    show(); await completeSteps(); fireEvent.click(screen.getByRole('button', { name: 'Design your VYBE' }));
    state.epoch = 3;
    await act(async () => { pending.resolve(state.profile); });
    expect(state.legal).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });
  it('does not finish from Skip before a birthday and the terms', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(state.ensure).not.toHaveBeenCalled();
    expect(state.error).toHaveBeenCalledWith('Add your birthday before continuing. You can skip the optional steps after that.');
    fireEvent.click(screen.getByRole('button', { name: 'Set test birthday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(state.ensure).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Accept test terms' })).toBeInTheDocument();
  });
  it('blocks an under-13 birthday', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Set underage birthday' }));
    expect(screen.getByRole('alert')).toHaveTextContent('VYBE is for people 13 and older.');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(state.ensure).not.toHaveBeenCalled();
  });
  it('allows only one pending skip after birthday and terms, and records both', async () => {
    const pending = deferred<unknown>();
    show();
    await completeSteps();
    state.ensure.mockReturnValueOnce(pending.promise);
    const skip = screen.getByRole('button', { name: 'Skip for now' });
    fireEvent.click(skip); fireEvent.click(skip);
    expect(state.ensure).toHaveBeenCalledOnce();
    state.update.mockRejectedValueOnce(new Error('Unavailable'));
    await act(async () => { pending.resolve(state.profile); });
    await screen.findByRole('alert');
    expect(state.birthday).toHaveBeenCalledOnce();
    expect(state.legal).toHaveBeenCalledOnce();
    expect(screen.queryByText('Home destination')).not.toBeInTheDocument();
    expect(state.clearUsername).not.toHaveBeenCalled();
  });
});
