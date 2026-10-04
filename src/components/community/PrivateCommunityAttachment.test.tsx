import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, read: vi.fn(), listeners: new Set<() => void>(), create: vi.fn(), revoke: vi.fn() }));
vi.mock('@/hooks/useCommunitySession', () => ({ useCommunitySession: () => ({ session: state.session, ready: true }) }));
vi.mock('@/lib/communityAttachmentService', () => ({ fetchCommunityAttachment: state.read }));
vi.mock('@/lib/communityService', () => ({ communityAccountLease: (uid: string, started: typeof state.session) => () => { if (uid !== state.session.uid || started.epoch !== state.session.epoch) throw new Error('Account changed'); },
  communityAccountSubscribe: (listener: () => void) => { state.listeners.add(listener); return () => state.listeners.delete(listener); } }));
import { PrivateCommunityAttachment } from './PrivateCommunityAttachment';
const props = { messageId: `attachment_${'a'.repeat(64)}`, attachmentId: 'a'.repeat(64), mediaType: 'image' };
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.listeners.clear(); state.read.mockResolvedValue(new Blob(['abc'], { type: 'image/png' })); state.create.mockReturnValue('blob:private-image');
  vi.stubGlobal('URL', class extends URL { static createObjectURL = state.create; static revokeObjectURL = state.revoke; }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('private media lifecycle', () => {
  it('never autoloads a private or legacy remote URL', () => {
    const view = render(<PrivateCommunityAttachment {...props} legacyUrl="https://example.invalid/old-token" />);
    expect(state.read).not.toHaveBeenCalled(); expect(document.querySelector('img,video')).toBeNull();
    view.rerender(<PrivateCommunityAttachment messageId="legacy" legacyUrl="https://example.invalid/old-token" mediaType="image" />);
    expect(screen.getByText(/older attachment is unavailable/)).toBeTruthy(); expect(state.read).not.toHaveBeenCalled(); expect(document.querySelector('[src]')).toBeNull();
  });
  it('opens only after a click and aborts/revokes every created URL on close', async () => {
    render(<PrivateCommunityAttachment {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Open private attachment' }));
    await screen.findByAltText('Shared attachment'); const signal = state.read.mock.calls[0][2] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Close attachment' })); expect(signal.aborted).toBe(true); expect(state.revoke).toHaveBeenCalledWith('blob:private-image'); expect(document.querySelector('img')).toBeNull();
  });
  it('clears already displayed bytes after a denied permission recheck', async () => {
    render(<PrivateCommunityAttachment {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Open private attachment' })); await screen.findByAltText('Shared attachment');
    state.read.mockRejectedValueOnce(new Error('Access removed')); await act(async () => { window.dispatchEvent(new Event('app-resumed')); });
    await screen.findByText('Access removed'); expect(document.querySelector('img')).toBeNull(); expect(state.revoke).toHaveBeenCalledWith('blob:private-image');
    expect(state.read.mock.calls[1][3]).toBe(true);
  });
  it('an account ABA drops a pending old download before creating any Blob URL', async () => {
    let resolve!: (blob: Blob) => void; state.read.mockReturnValue(new Promise<Blob>(yes => { resolve = yes; }));
    const view = render(<PrivateCommunityAttachment {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Open private attachment' }));
    const signal = state.read.mock.calls[0][2] as AbortSignal; state.session = { uid: 'alice', epoch: 3 };
    act(() => { state.listeners.forEach(listener => listener()); }); view.rerender(<PrivateCommunityAttachment {...props} />);
    await act(async () => { resolve(new Blob(['secret'])); }); expect(signal.aborted).toBe(true); expect(state.create).not.toHaveBeenCalled(); expect(document.querySelector('img')).toBeNull();
  });
  it('page hiding clears bytes and returning never automatically reopens them', async () => {
    render(<PrivateCommunityAttachment {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Open private attachment' })); await screen.findByAltText('Shared attachment');
    act(() => { window.dispatchEvent(new Event('pagehide')); }); expect(document.querySelector('img')).toBeNull();
    act(() => { window.dispatchEvent(new Event('app-resumed')); }); expect(state.read).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Open private attachment' })).toBeTruthy();
  });
  it('unmount prevents a late response and removes its account subscription', async () => {
    let resolve!: (blob: Blob) => void; state.read.mockReturnValue(new Promise<Blob>(yes => { resolve = yes; })); const view = render(<PrivateCommunityAttachment {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open private attachment' })); view.unmount();
    await act(async () => { resolve(new Blob(['late'])); }); expect(state.create).not.toHaveBeenCalled(); expect(state.listeners.size).toBe(0);
  });
});
