import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeTokens } from '@/hooks/useCustomTheme';

const mock = vi.hoisted(() => ({
  actor: { uid: 'alice', profileId: 'alice-profile', epoch: 1 },
  friends: { data: [] as unknown[], isError: false, isLoading: false, refetch: vi.fn() },
  share: vi.fn(), pending: false,
}));
vi.mock('@/hooks/useSharedThemes', () => ({ useShareTheme: () => ({ mutateAsync: mock.share, isPending: mock.pending }) }));
vi.mock('@/hooks/useFriends', () => ({ useFriends: () => mock.friends }));
vi.mock('@/hooks/useThemeActor', () => ({ useThemeActor: () => ({ actor: mock.actor, key: [mock.actor.uid, mock.actor.epoch, mock.actor.profileId] }) }));
vi.mock('./ThemePreviewCanvas', () => ({ ThemePreviewCanvas: () => <div data-testid="theme-preview" /> }));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> },
}));
import { ShareMyThemeSheet } from './ShareMyThemeSheet';

const tokens = { themeName: 'Original', colorPrimary: '270 80% 50%', mode: 'dark' } as ThemeTokens;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.actor = { uid: 'alice', profileId: 'alice-profile', epoch: mock.actor.epoch + 1 };
  mock.friends = { data: [], isError: false, isLoading: false, refetch: vi.fn() }; mock.pending = false;
  mock.share.mockResolvedValue({ visibility: 'public', row: { id: 'theme-one' } });
});
afterEach(cleanup);

describe('share sheet truthful state and draft lifecycle', () => {
  it('distinguishes friend loading and failed reads from a confirmed empty friend list', () => {
    mock.friends.isLoading = true;
    const view = render(<ShareMyThemeSheet open onClose={vi.fn()} tokens={tokens} />);
    expect(screen.getByText('Loading friends…')).toBeInTheDocument();
    expect(screen.queryByText(/No friends yet/)).not.toBeInTheDocument();
    mock.friends.isLoading = false; mock.friends.isError = true;
    view.rerender(<ShareMyThemeSheet open onClose={vi.fn()} tokens={tokens} />);
    expect(screen.getByText('Could not load your friends.')).toBeInTheDocument();
    expect(screen.queryByText(/No friends yet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mock.friends.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pick friends' })).toBeDisabled();
  });

  it('preserves an editable draft after sharing fails and retries the same content', async () => {
    const close = vi.fn(); mock.share.mockRejectedValueOnce(new Error('Delivery unavailable'));
    render(<ShareMyThemeSheet open onClose={close} tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    fireEvent.change(screen.getByPlaceholderText('Theme name'), { target: { value: 'Keep my title' } });
    fireEvent.change(screen.getByPlaceholderText('Describe your vibe (optional)'), { target: { value: 'Keep my description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(mock.share).toHaveBeenCalledTimes(1));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Theme name')).toHaveValue('Keep my title');
    expect(screen.getByPlaceholderText('Describe your vibe (optional)')).toHaveValue('Keep my description');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mock.share.mock.calls[1][0]).toEqual(mock.share.mock.calls[0][0]);
  });

  it('does not close a newly reopened sheet when an old request finishes', async () => {
    const close = vi.fn(); const request = deferred<unknown>(); mock.share.mockReturnValue(request.promise);
    const view = render(<ShareMyThemeSheet open onClose={close} tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    view.rerender(<ShareMyThemeSheet open={false} onClose={close} tokens={tokens} />);
    view.rerender(<ShareMyThemeSheet open onClose={close} tokens={tokens} />);
    await act(async () => { request.resolve({ visibility: 'public', row: { id: 'theme-one' } }); });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pick friends' })).toBeInTheDocument();
  });

  it('clears an already-created private share link when the account changes', async () => {
    mock.share.mockResolvedValue({ visibility: 'unlisted', row: { id: 'alice-private-theme' } });
    const view = render(<ShareMyThemeSheet open onClose={vi.fn()} tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await screen.findByLabelText('Theme share link');
    mock.actor = { uid: 'bob', profileId: 'bob-profile', epoch: mock.actor.epoch + 1 };
    view.rerender(<ShareMyThemeSheet open onClose={vi.fn()} tokens={tokens} />);
    expect(screen.queryByLabelText('Theme share link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(screen.getByRole('button', { name: 'Create link' })).toBeInTheDocument();
  });

  it('clears account-specific friend selections and draft text on session changes', () => {
    mock.friends.data = [{ id: 'alice-friend', username: 'friend', display_name: 'Alice friend' }];
    const view = render(<ShareMyThemeSheet open onClose={vi.fn()} tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: /Alice friend/ }));
    expect(screen.getByRole('button', { name: 'Send to 1' })).toBeInTheDocument();
    // A fresh epoch of the same UID must not revive a previous login's draft.
    mock.actor = { ...mock.actor, epoch: mock.actor.epoch + 1 };
    view.rerender(<ShareMyThemeSheet open onClose={vi.fn()} tokens={tokens} />);
    expect(screen.getByRole('button', { name: 'Pick friends' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    fireEvent.change(screen.getByPlaceholderText('Theme name'), { target: { value: 'Private draft' } });
    fireEvent.change(screen.getByPlaceholderText('Describe your vibe (optional)'), { target: { value: 'Private description' } });
    mock.actor = { uid: 'bob', profileId: 'bob-profile', epoch: mock.actor.epoch + 1 };
    view.rerender(<ShareMyThemeSheet open onClose={vi.fn()} tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    expect(screen.getByPlaceholderText('Theme name')).toHaveValue('Original');
    expect(screen.getByPlaceholderText('Describe your vibe (optional)')).toHaveValue('');
  });
});
