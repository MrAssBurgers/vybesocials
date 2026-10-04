import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, send: vi.fn() }));
vi.mock('@/hooks/useCommunitySession', () => ({ useCommunitySession: () => ({ session: state.session, ready: true }) }));
vi.mock('@/lib/communityAttachmentService', () => ({ sendCommunityAttachment: state.send, validateCommunityAttachment: (file: File) => { if (file.type !== 'image/png') throw new Error('Unsupported file'); } }));
vi.mock('@/lib/communityService', () => ({ communityAccountLease: (uid: string, started: typeof state.session) => () => { if (uid !== state.session.uid || started.epoch !== state.session.epoch) throw new Error('Account changed'); } }));
import { CommunityAttachmentComposer } from './CommunityAttachmentComposer';
function fixture(disabled = false) { const client = new QueryClient(); return render(<CommunityAttachmentComposer channelId="channel" disabled={disabled} />, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }); }
function choose() { fireEvent.click(screen.getByRole('button', { name: 'Attach file' })); fireEvent.change(screen.getByLabelText('Private channel attachment'), { target: { files: [new File(['abc'], 'photo.png', { type: 'image/png' })] } }); }
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.send.mockResolvedValue('message'); });
afterEach(cleanup);
describe('explicit attachment composer', () => {
  it('does not upload until file selection and explicit send', async () => {
    fixture(); expect(state.send).not.toHaveBeenCalled(); choose(); fireEvent.change(screen.getByRole('textbox', { name: 'Attachment message' }), { target: { value: 'Caption' } });
    expect(state.send).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Send attachment' })); await screen.findByText('Private attachment sent.');
    expect(state.send.mock.calls[0][0]).toMatchObject({ channelId: 'channel', content: 'Caption', session: { uid: 'alice', epoch: 1 } });
  });
  it('retains file, caption and request identity after failure and retries the same snapshot', async () => {
    state.send.mockRejectedValueOnce(new Error('Lost response')); fixture(); choose(); fireEvent.change(screen.getByRole('textbox', { name: 'Attachment message' }), { target: { value: 'Keep caption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send attachment' })); await screen.findByText('Lost response');
    expect(screen.getByRole('textbox', { name: 'Attachment message' })).toHaveValue('Keep caption'); expect(screen.queryByText('Private attachment sent.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry attachment' })); await screen.findByText('Private attachment sent.');
    expect(state.send.mock.calls[1][0]).toBe(state.send.mock.calls[0][0]);
  });
  it('only explicit reset allows a new upload after ambiguous failure', async () => {
    state.send.mockRejectedValue(new Error('Lost response')); fixture(); choose(); fireEvent.click(screen.getByRole('button', { name: 'Send attachment' })); await screen.findByText('Lost response');
    expect(screen.getByLabelText('Private channel attachment')).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Start new upload' })); expect(screen.getByLabelText('Private channel attachment')).not.toBeDisabled();
  });
  it('permission loss disables selection and closes pending upload work', async () => {
    const pending = new Promise(() => {}); state.send.mockReturnValue(pending); const view = fixture(); choose(); fireEvent.click(screen.getByRole('button', { name: 'Send attachment' }));
    await waitFor(() => expect(state.send).toHaveBeenCalled()); const signal = state.send.mock.calls[0][1] as AbortSignal;
    view.rerender(<CommunityAttachmentComposer channelId="channel" disabled />); expect(signal.aborted).toBe(true); expect(screen.queryByLabelText('Private channel attachment')).toBeNull(); expect(screen.getByRole('button', { name: 'Attach file' })).toBeDisabled();
  });
  it('late success cannot clear or confirm a newer account’s composer', async () => {
    let resolve!: (value: string) => void; state.send.mockReturnValue(new Promise<string>(yes => { resolve = yes; })); const view = fixture(); choose(); fireEvent.click(screen.getByRole('button', { name: 'Send attachment' }));
    state.session = { uid: 'alice', epoch: 3 }; view.rerender(<CommunityAttachmentComposer channelId="channel" disabled={false} />);
    await act(async () => { resolve('old-message'); }); expect(screen.queryByText('Private attachment sent.')).toBeNull(); expect(screen.getByRole('button', { name: 'Attach file' })).toBeTruthy();
  });
});
