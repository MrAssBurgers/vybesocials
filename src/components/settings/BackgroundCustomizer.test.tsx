import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundCustomizer } from './BackgroundCustomizer';
const mock = vi.hoisted(() => ({ uid: 'alice-auth', profileId: 'alice-profile', upload: vi.fn(), publicUrl: vi.fn(), sign: vi.fn(), add: vi.fn(), activate: vi.fn(), remove: vi.fn(), clear: vi.fn(), rename: vi.fn(), generate: vi.fn(), setImage: vi.fn(), setOpacity: vi.fn(), setBlur: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn(), retry: vi.fn(), libraryError: false }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, profile: { id: mock.profileId } }) }));
vi.mock('@/lib/firebase/authService', () => ({ firebaseAuth: { getUser: async () => ({ data: { user: { id: mock.uid } } }) } }));
vi.mock('@/lib/firebase', () => ({ db: { storage: { from: () => ({ upload: mock.upload, getPublicUrl: mock.publicUrl }) }, functions: { invoke: mock.generate } } }));
vi.mock('@/lib/signedUrlCache', () => ({ needsSigning: (url: string) => url.startsWith('gs://'), getSignedUrl: mock.sign }));
vi.mock('@/components/ui/SignedMedia', () => ({ SignedImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} /> }));
vi.mock('@/components/layout/AppBackground', () => ({ useAppBackgroundSafe: () => ({ setBackgroundImage: mock.setImage, setBackgroundOpacity: mock.setOpacity, setBackgroundBlur: mock.setBlur, refreshBackground: mock.refresh }) }));
vi.mock('@/hooks/useUserBackgrounds', () => ({
  useUserBackgrounds: () => ({ data: [{ id: 'one', image_url: 'gs://bucket/one.png', name: 'Saved wallpaper', is_active: true }], isLoading: false, isError: mock.libraryError, refetch: mock.retry }),
  useAddBackground: () => ({ mutateAsync: mock.add }), useSetActiveBackground: () => ({ mutateAsync: mock.activate }),
  useDeleteBackground: () => ({ mutateAsync: mock.remove }), useRenameBackground: () => ({ mutateAsync: mock.rename }),
  useClearActiveBackground: () => ({ mutateAsync: mock.clear }),
}));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: mock.error, message: vi.fn() } }));
vi.mock('./ColorMatchPrompt', () => ({ ColorMatchPrompt: () => null }));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const changed = vi.fn();
function View() { return <BackgroundCustomizer currentBackground="https://example.test/current.png" backgroundOpacity={85} backgroundBlur={0} onBackgroundChange={changed} onOpacityChange={vi.fn()} onBlurChange={vi.fn()} />; }
function upload() { fireEvent.change(screen.getByLabelText('Upload background image'), { target: { files: [new File(['png'], 'wallpaper.png', { type: 'image/png' })] } }); }
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'alice-auth'; mock.profileId = 'alice-profile'; mock.libraryError = false;
  mock.upload.mockResolvedValue({ error: null }); mock.publicUrl.mockReturnValue({ data: { publicUrl: 'gs://bucket/new.png' } }); mock.sign.mockResolvedValue('https://example.test/resolved.png');
  mock.add.mockResolvedValue({}); mock.activate.mockResolvedValue({}); mock.clear.mockResolvedValue({}); mock.generate.mockResolvedValue({ data: { url: 'https://example.test/generated.png' }, error: null });
});
afterEach(cleanup);
describe('background controls', () => {
  it('uploads under the auth UID, resolves gs URLs, and waits for persistence before applying', async () => {
    const pending = deferred<unknown>(); mock.add.mockReturnValue(pending.promise);
    render(<View />); upload();
    await waitFor(() => expect(mock.add).toHaveBeenCalledTimes(1));
    expect(mock.upload.mock.calls[0][0]).toMatch(/^alice-auth\/backgrounds\/[\w-]+\.png$/);
    expect(mock.upload.mock.calls[0][2]).toMatchObject({ upsert: false });
    expect(mock.add).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'gs://bucket/new.png', setActive: true }));
    expect(changed).not.toHaveBeenCalled(); expect(mock.setImage).not.toHaveBeenCalled();
    await act(async () => pending.resolve({}));
    expect(changed).toHaveBeenCalledWith('https://example.test/resolved.png');
    expect(mock.success).toHaveBeenCalledWith('Background applied!');
  });
  it('does not paint or announce success for a rejected upload save', async () => {
    mock.add.mockRejectedValue(new Error('Write denied'));
    render(<View />); upload();
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith('Write denied'));
    expect(changed).not.toHaveBeenCalled(); expect(mock.setImage).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
  });
  it('preserves the current image and adjustments when reset persistence fails', async () => {
    mock.clear.mockRejectedValue(new Error('Write denied'));
    render(<View />); fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    await waitFor(() => expect(mock.clear).toHaveBeenCalledTimes(1));
    expect(changed).not.toHaveBeenCalled(); expect(mock.setImage).not.toHaveBeenCalled(); expect(mock.setOpacity).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
  });
  it('never saves or paints an old upload after changing accounts', async () => {
    const pending = deferred<{ error: null }>(); mock.upload.mockReturnValue(pending.promise);
    const view = render(<View />); upload();
    await waitFor(() => expect(mock.upload).toHaveBeenCalledTimes(1));
    mock.uid = 'bob-auth'; mock.profileId = 'bob-profile'; view.rerender(<View />);
    await act(async () => pending.resolve({ error: null }));
    expect(mock.add).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
  });
  it('accepts the actual generate-background url response only after an explicit request', async () => {
    render(<View />); expect(mock.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Neon Glow' }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith('https://example.test/generated.png'));
    expect(mock.add).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://example.test/generated.png' }));
  });
  it('distinguishes library errors from an empty library and supports retry', () => {
    mock.libraryError = true; render(<View />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your backgrounds');
    expect(screen.queryByText('No saved backgrounds yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(mock.retry).toHaveBeenCalledTimes(1);
  });
});
