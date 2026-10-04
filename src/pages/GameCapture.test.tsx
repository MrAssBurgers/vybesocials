import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GameCapture from './GameCapture';

const mocks = vi.hoisted(() => ({ userId: 'player', get: vi.fn(), download: vi.fn(), publish: vi.fn(), complete: vi.fn(), discard: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('@/hooks/usePosts', () => ({ useCreatePost: () => ({ mutateAsync: mocks.publish }) }));
vi.mock('@/lib/gameCaptureService', () => ({ getGameCapture: mocks.get, downloadGameCapture: mocks.download, completeGameCapture: mocks.complete, discardGameCapture: mocks.discard, gameCaptureErrorMessage: (error: Error) => error.message }));
const id = 'a'.repeat(48);
afterEach(cleanup);
function show(path = `/game-capture/${id}`) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/game-capture/:captureId" element={<GameCapture />} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  mocks.userId = 'player';
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn().mockReturnValue('blob:test-capture'); URL.revokeObjectURL = vi.fn();
  mocks.get.mockResolvedValue({ captureId: id, status: 'ready', gameName: 'Neon Rally', caption: 'Victory!', tags: ['racing'], contentType: 'image/png', expiresAt: Date.now() + 86_400_000 });
  mocks.download.mockResolvedValue(new File(['image'], 'capture.png', { type: 'image/png' }));
  mocks.publish.mockResolvedValue({ id: 'published-post' }); mocks.complete.mockResolvedValue({}); mocks.discard.mockResolvedValue({ ok: true });
});

describe('game capture review', () => {
  it('does not publish until the player reviews and confirms', async () => {
    show();
    await screen.findByRole('button', { name: 'Publish to VYBE' });
    expect(mocks.publish).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Add your caption'), { target: { value: 'My new caption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish to VYBE' }));
    expect(await screen.findByRole('link', { name: 'View your post' })).toHaveAttribute('href', '/p/published-post');
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ caption: 'My new caption', type: 'post', mediaFile: expect.any(File) }));
    expect(mocks.complete).toHaveBeenCalledWith(id, 'published-post');
  });
  it('keeps the success state when receipt sync fails after publishing', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('network'));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Publish to VYBE' }));
    await screen.findByText(/Your post is live. The game receipt/);
    expect(screen.queryByRole('button', { name: 'Publish to VYBE' })).not.toBeInTheDocument();
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });
  it('allows retry after a safety check rejects publishing', async () => {
    mocks.publish.mockRejectedValueOnce(new Error('Content needs review'));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Publish to VYBE' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Content needs review');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish to VYBE' })).toBeEnabled());
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('discards without creating a social post', async () => {
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await screen.findByText('Capture discarded. You can head back to your game.');
    expect(mocks.discard).toHaveBeenCalledWith(id); expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('rejects malformed links before contacting Firebase', async () => {
    show('/game-capture/not-valid');
    expect(await screen.findByRole('alert')).toHaveTextContent('link is invalid');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('shows an unavailable capture without a publish button', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Capture not found for this account.'));
    show(); await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Publish to VYBE' })).not.toBeInTheDocument();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('does not apply an old publish response after the signed-in account changes', async () => {
    let resolvePublish!: (post: { id: string }) => void;
    mocks.publish.mockImplementationOnce(() => new Promise(resolve => { resolvePublish = resolve; }));
    const view = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish to VYBE' }));
    mocks.userId = 'another-player';
    mocks.get.mockRejectedValueOnce(new Error('Capture not found for this account.'));
    view.rerender(<MemoryRouter initialEntries={[`/game-capture/${id}`]}><Routes><Route path="/game-capture/:captureId" element={<GameCapture />} /></Routes></MemoryRouter>);
    await screen.findByText('Capture not found for this account.');
    await act(async () => resolvePublish({ id: 'old-account-post' }));
    expect(screen.queryByRole('link', { name: 'View your post' })).not.toBeInTheDocument();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('can retry only the receipt after a live post acknowledgement fails', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('network'));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Publish to VYBE' }));
    const sync = await screen.findByRole('button', { name: 'Retry receipt sync' });
    mocks.get.mockResolvedValueOnce({ status: 'imported', postId: 'published-post' });
    fireEvent.click(sync);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry receipt sync' })).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(mocks.publish).toHaveBeenCalledTimes(1);
  });
  it('recovers a post committed before the publish response was lost', async () => {
    mocks.publish.mockRejectedValueOnce(new Error('network'));
    show(); const publish = await screen.findByRole('button', { name: 'Publish to VYBE' });
    mocks.get.mockResolvedValueOnce({ status: 'imported', postId: 'recovered-post' });
    fireEvent.click(publish);
    expect(await screen.findByRole('link', { name: 'View your post' })).toHaveAttribute('href', '/p/recovered-post');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(mocks.publish).toHaveBeenCalledTimes(1);
  });
  it('recovers a cross-tab publish that makes discard unavailable', async () => {
    mocks.discard.mockRejectedValueOnce(new Error('Already published'));
    show(); const discard = await screen.findByRole('button', { name: 'Discard' });
    mocks.get.mockResolvedValueOnce({ status: 'imported', postId: 'other-tab-post' });
    fireEvent.click(discard);
    expect(await screen.findByRole('link', { name: 'View your post' })).toHaveAttribute('href', '/p/other-tab-post');
    expect(screen.queryByText('Capture discarded. You can head back to your game.')).not.toBeInTheDocument();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('does not acknowledge an old publish after A → B → A or unmount', async () => {
    let finish!: (post: { id: string }) => void;
    mocks.publish.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const page = show(); fireEvent.click(await screen.findByRole('button', { name: 'Publish to VYBE' }));
    const view = () => <MemoryRouter initialEntries={[`/game-capture/${id}`]}><Routes><Route path="/game-capture/:captureId" element={<GameCapture />} /></Routes></MemoryRouter>;
    mocks.userId = 'another'; page.rerender(view()); await screen.findByRole('button', { name: 'Publish to VYBE' });
    mocks.userId = 'player'; page.rerender(view()); await screen.findByRole('button', { name: 'Publish to VYBE' });
    await act(async () => finish({ id: 'stale-post' }));
    expect(screen.queryByRole('link', { name: 'View your post' })).not.toBeInTheDocument(); expect(mocks.complete).not.toHaveBeenCalled();
    mocks.publish.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish to VYBE' })); page.unmount();
    await act(async () => finish({ id: 'unmounted-post' })); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('does not download an already expired capture or offer publishing it', async () => {
    mocks.get.mockResolvedValueOnce({ status: 'ready', gameName: 'Game', caption: '', tags: [], expiresAt: Date.now() - 1 });
    show(); await screen.findByText('This capture has expired');
    expect(mocks.download).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Publish to VYBE' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check capture status' })).toBeInTheDocument();
  });
  it('shows cancelled as discarded and releases the preview after a successful discard', async () => {
    mocks.get.mockResolvedValueOnce({ status: 'cancelled', gameName: 'Game', caption: '', tags: [], expiresAt: Date.now() + 1_000 });
    const page = show(); await screen.findByText('Capture discarded. You can head back to your game.');
    expect(mocks.download).not.toHaveBeenCalled(); page.unmount();
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await screen.findByText('Capture discarded. You can head back to your game.');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-capture');
  });
});
