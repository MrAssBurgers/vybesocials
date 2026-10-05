import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice-auth', profileId: 'legacy-alice-profile', epoch: 1, upload: vi.fn(), resolveUrl: vi.fn(), bucket: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { ready: true, user: { id: uid }, profile: { id: state.profileId, user_id: uid }, session: { uid, epoch }, guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/firebase', () => ({ db: { storage: { from: (...args: unknown[]) => state.bucket(...args) } } }));
vi.mock('@/lib/vybemap/mapSocialService', () => ({ mapSocialRequest: vi.fn(), mapSocialAttempt: vi.fn() }));
vi.mock('@/hooks/vybemap/useLocationIntel', () => ({ useLocationIntel: () => ({ data: null, isLoading: false }) }));
vi.mock('@/components/vybemap/LocationIntelPanel', () => ({ LocationIntelPanel: () => null }));
vi.mock('sonner', () => ({ toast: { success: state.toast, error: state.toast } }));
import { SpotDropSheet } from './SpotDropSheet';
const PHOTO = 'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/media%2Falice-auth%2Fmap-spots%2Fphoto.png?alt=media&token=synthetic';
const file = () => new File(['synthetic photo fixture'], 'photo.png', { type: 'image/png' });
const choosePhoto = () => fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file()] } });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function fillDraft() { fireEvent.change(screen.getByPlaceholderText('Spot name — e.g. Rooftop sunset spot'), { target: { value: 'Picnic spot' } }); fireEvent.change(screen.getByPlaceholderText('Why is this a cool place to hang? (optional)'), { target: { value: 'Bring snacks' } }); fireEvent.click(screen.getByRole('button', { name: /Food/ })); }
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice-auth'; state.profileId = 'legacy-alice-profile'; state.epoch++; state.bucket.mockReturnValue({ upload: state.upload, createSignedUrl: state.resolveUrl }); state.upload.mockImplementation(async (path: string) => ({ data: { path }, error: null })); state.resolveUrl.mockResolvedValue({ data: { signedUrl: PHOTO }, error: null }); });
afterEach(cleanup);
describe('spot photo and publication lifecycle', () => {
  it('uploads under the real Auth UID and publishes the acknowledged usable URL, never a profile path or gs placeholder', async () => {
    const submit = vi.fn().mockResolvedValue(undefined), close = vi.fn(); render(<SpotDropSheet coords={[1, 2]} onClose={close} onSubmit={submit} />); fillDraft(); choosePhoto();
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', PHOTO));
    expect(state.bucket).toHaveBeenCalledWith('media'); expect(state.upload).toHaveBeenCalledWith(expect.stringMatching(/^alice-auth\/map-spots\/[a-f\d-]+\.png$/), expect.any(File));
    expect(state.upload.mock.calls[0][0]).not.toContain('legacy-alice-profile'); expect(state.resolveUrl).toHaveBeenCalledWith(state.upload.mock.calls[0][0]);
    fireEvent.click(screen.getByRole('button', { name: 'Drop on VybeMap' })); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith({ name: 'Picnic spot', category: 'food', description: 'Bring snacks', photo_url: PHOTO, vibe_tags: ['food'] });
  });
  it('preserves the draft after an upload failure and permits choosing the same file again', async () => {
    state.upload.mockResolvedValueOnce({ data: null, error: new Error('Upload offline') }); render(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={vi.fn()} />); fillDraft(); choosePhoto();
    await screen.findByText('Upload offline'); expect(state.resolveUrl).not.toHaveBeenCalled(); expect(screen.getByPlaceholderText('Spot name — e.g. Rooftop sunset spot')).toHaveValue('Picnic spot'); expect(screen.getByPlaceholderText('Why is this a cool place to hang? (optional)')).toHaveValue('Bring snacks'); expect(screen.getByRole('button', { name: /Food/ })).toHaveAttribute('aria-pressed', 'true'); expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('input[type=file]')).toHaveValue(''); choosePhoto(); await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', PHOTO)); expect(state.upload).toHaveBeenCalledTimes(2);
  });
  it('blocks publishing until both upload and URL resolution have confirmed', async () => {
    const upload = deferred<any>(), url = deferred<any>(), submit = vi.fn(); state.upload.mockReturnValue(upload.promise); state.resolveUrl.mockReturnValue(url.promise);
    render(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={submit} />); fillDraft(); choosePhoto();
    const publish = screen.getByRole('button', { name: 'Drop on VybeMap' }); expect(publish).toBeDisabled(); fireEvent.click(publish); expect(submit).not.toHaveBeenCalled();
    await act(async () => upload.resolve({ data: { path: state.upload.mock.calls[0][0] }, error: null })); expect(publish).toBeDisabled(); fireEvent.click(publish); expect(submit).not.toHaveBeenCalled();
    await act(async () => url.resolve({ data: { signedUrl: PHOTO }, error: null })); await waitFor(() => expect(publish).toBeEnabled());
  });
  it('does not resolve or install a late upload from a retired account, including Alice→Bob→Alice', async () => {
    const upload = deferred<any>(); state.upload.mockReturnValue(upload.promise); const ui = render(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={vi.fn()} />); choosePhoto();
    state.uid = 'bob'; state.epoch++; ui.rerender(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={vi.fn()} />); state.uid = 'alice-auth'; state.epoch++; ui.rerender(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={vi.fn()} />);
    await act(async () => upload.resolve({ data: { path: state.upload.mock.calls[0][0] }, error: null })); expect(state.resolveUrl).not.toHaveBeenCalled(); expect(document.querySelector('img')).toBeNull(); expect(state.toast).not.toHaveBeenCalled();
  });
  it('cannot populate a replacement sheet after late URL resolution from a closed sheet', async () => {
    const url = deferred<any>(); state.resolveUrl.mockReturnValue(url.promise); const ui = render(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={vi.fn()} />); choosePhoto(); await waitFor(() => expect(state.resolveUrl).toHaveBeenCalledTimes(1)); ui.unmount();
    render(<SpotDropSheet coords={[3, 4]} onClose={vi.fn()} onSubmit={vi.fn()} />); await act(async () => url.resolve({ data: { signedUrl: PHOTO }, error: null }));
    expect(document.querySelector('img')).toBeNull(); expect(screen.getByRole('button', { name: 'Add a photo (optional)' })).toBeEnabled(); expect(state.toast).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: null }, { data: { path: 'another-owner/photo.png' }, error: null }])('rejects incomplete or mismatched upload acknowledgement %j', async reply => {
    state.upload.mockResolvedValue(reply); render(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={vi.fn()} />); choosePhoto(); await screen.findByRole('alert'); expect(state.resolveUrl).not.toHaveBeenCalled(); expect(document.querySelector('img')).toBeNull();
  });
  it('retains the draft and refuses an unusable gs URL receipt', async () => {
    state.resolveUrl.mockResolvedValue({ data: { signedUrl: 'gs://demo.appspot.com/media/photo.png' }, error: null }); render(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={vi.fn()} />); fillDraft(); choosePhoto(); await screen.findByRole('alert'); expect(document.querySelector('img')).toBeNull(); expect(screen.getByPlaceholderText('Spot name — e.g. Rooftop sunset spot')).toHaveValue('Picnic spot');
  });
  it('locks the selected category during publish and retains it after a failed save', async () => {
    const pending = deferred<void>(), submit = vi.fn().mockReturnValue(pending.promise); render(<SpotDropSheet coords={[1, 2]} onClose={vi.fn()} onSubmit={submit} />); fillDraft(); fireEvent.click(screen.getByRole('button', { name: 'Drop on VybeMap' }));
    const change = screen.getByRole('button', { name: /Study/ }); expect(change).toBeDisabled(); fireEvent.click(change); expect(screen.getByRole('button', { name: /Food/ })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => pending.reject(new Error('Save unavailable'))); await screen.findByText('Save unavailable');
    expect(state.toast).not.toHaveBeenCalled(); expect(submit.mock.calls[0][0].category).toBe('food'); expect(screen.getByRole('button', { name: /Food/ })).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByPlaceholderText('Spot name — e.g. Rooftop sunset spot')).toHaveValue('Picnic spot');
  });
});
