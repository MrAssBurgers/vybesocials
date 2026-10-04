import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBackgroundProvider, useAppBackground } from './AppBackground';

const mock = vi.hoisted(() => ({ uid: 'alice', profileId: 'alice-profile', load: vi.fn(), sign: vi.fn(), setters: [] as ((url: string | null) => void)[] }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null, profile: mock.profileId ? { id: mock.profileId } : null }) }));
vi.mock('@/lib/firebase/authService', () => ({ firebaseAuth: { getUser: async () => ({ data: { user: { id: mock.uid } } }) } }));
vi.mock('@/lib/userBackgroundRepository', () => ({ loadUserBackgrounds: mock.load }));
vi.mock('@/lib/signedUrlCache', () => ({ needsSigning: (url: string) => url.startsWith('gs://'), getSignedUrl: mock.sign }));
vi.mock('@/lib/cosmeticConstants', () => ({ THEME_IMAGES: {} }));
vi.mock('@/lib/liquidShellState', () => ({ stripLiquidShellDocumentState: vi.fn() }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const rows = (url: string) => [{ is_active: true, image_url: url }];
function Consumer() {
  const context = useAppBackground();
  mock.setters.push(context.setBackgroundImage);
  return <><output data-testid="url">{context.background.imageUrl || 'none'}</output><output data-testid="ready">{String(context.isBackgroundResolved)}</output></>;
}
function View() { return <AppBackgroundProvider><Consumer /></AppBackgroundProvider>; }
beforeEach(() => { vi.clearAllMocks(); mock.uid = 'alice'; mock.profileId = 'alice-profile'; mock.setters = []; mock.load.mockResolvedValue([]); mock.sign.mockImplementation(async (url: string) => url.replace('gs://', 'https://')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('wallpaper lifecycle', () => {
  it('resolves stored gs references before painting', async () => {
    mock.load.mockResolvedValue(rows('gs://bucket/alice.png'));
    render(<View />);
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('https://bucket/alice.png'));
    expect(document.body.style.backgroundImage).toContain('https://bucket/alice.png');
  });
  it('clears the prior account immediately while the next library is pending', async () => {
    mock.load.mockResolvedValueOnce(rows('https://example.test/alice.png'));
    const view = render(<View />);
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('alice.png'));
    const next = deferred<unknown[]>(); mock.load.mockReturnValue(next.promise);
    mock.uid = 'bob'; mock.profileId = 'bob-profile'; view.rerender(<View />);
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    expect(document.body.style.backgroundImage).toBe('');
    await act(async () => next.resolve([]));
  });
  it('a late old-account load cannot seed a raw URL for the 45-minute refresh', async () => {
    vi.useFakeTimers();
    const old = deferred<unknown[]>(); mock.load.mockReturnValueOnce(old.promise).mockResolvedValue(rows('gs://bucket/bob.png'));
    const view = render(<View />);
    mock.uid = 'bob'; mock.profileId = 'bob-profile'; view.rerender(<View />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => old.resolve(rows('gs://bucket/alice.png')));
    await act(async () => { await vi.advanceTimersByTimeAsync(45 * 60 * 1000); });
    expect(screen.getByTestId('url')).toHaveTextContent('https://bucket/bob.png');
    expect(mock.sign.mock.calls.flat()).not.toContain('gs://bucket/alice.png');
  });
  it('late signing and old setter callbacks cannot paint after an A→B→A switch', async () => {
    const pending = deferred<string>(); mock.sign.mockReturnValue(pending.promise);
    const view = render(<View />);
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    const oldSetter = mock.setters.at(-1)!;
    act(() => oldSetter('gs://bucket/old.png'));
    mock.uid = 'bob'; mock.profileId = 'bob-profile'; view.rerender(<View />);
    mock.uid = 'alice'; mock.profileId = 'alice-profile'; view.rerender(<View />);
    await act(async () => { pending.resolve('https://bucket/old.png'); oldSetter('https://example.test/stale.png'); });
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    expect(document.body.style.backgroundImage).toBe('');
  });
  it('rejects late provider work after unmount', async () => {
    const pending = deferred<unknown[]>(); mock.load.mockReturnValue(pending.promise);
    const view = render(<View />); const setter = mock.setters.at(-1)!;
    view.unmount();
    await act(async () => { pending.resolve(rows('gs://bucket/stale.png')); setter('https://example.test/stale.png'); });
    expect(mock.sign).not.toHaveBeenCalled();
    expect(document.body.style.backgroundImage).toBe('');
  });
  it('a failed refresh resolves to the default instead of a prior account image', async () => {
    mock.load.mockRejectedValue(new Error('Denied'));
    render(<View />);
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
  });
});
