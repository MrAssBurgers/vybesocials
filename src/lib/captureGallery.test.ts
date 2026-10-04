import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCaptureGallery, type CaptureGalleryClient } from '../../sdk/universal/gallery';

const id = 'a'.repeat(48);
const row = { captureId: id, status: 'ready' as const, gameId: 'mod', gameName: 'Mod', contentType: 'image/png' as const, byteSize: 12, caption: '<img src=x onerror=alert(1)>', tags: [], expiresAt: Date.now() + 600000, postId: null, reviewUrl: `https://vybehub.app/game-capture/${id}` };
let cleanup: () => void;
const flush = async () => { await vi.advanceTimersByTimeAsync(1); };
function harness() {
  const target = document.createElement('div'); document.body.append(target);
  const attach = target.attachShadow.bind(target); vi.spyOn(target, 'attachShadow').mockImplementation(() => attach({ mode: 'open' }));
  const client = {
    authorization: { connectionId: 'connection-a', expiresAt: Date.now() + 600000, scopes: ['capture:write', 'capture:status', 'capture:preview'] },
    listCaptures: vi.fn(async () => ({ captures: [row], nextCursor: null })),
    getCapturePreview: vi.fn(async () => new Blob([new Uint8Array(12)], { type: 'image/png' })),
    checkCapturePreview: vi.fn(async () => {}), openReview: vi.fn(async () => {}),
  };
  const gallery = mountCaptureGallery(target, client as CaptureGalleryClient); cleanup = () => gallery.dispose();
  const root = target.shadowRoot!;
  const button = (label: string) => [...root.querySelectorAll('button')].find(node => node.textContent === label)!;
  return { client, root, button, gallery };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:private-preview'); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup?.(); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('embedded capture gallery', () => {
  it('performs no network on mount and renders caption text safely on explicit load', async () => {
    const h = harness(); expect(h.client.listCaptures).not.toHaveBeenCalled();
    h.button('Load captures').click(); await flush();
    expect(h.root.textContent).toContain(row.caption); expect(h.root.querySelector('img')).toBeNull();
    expect(h.client.getCapturePreview).not.toHaveBeenCalled();
  });
  it('opens media only on selection and releases its object URL on Close', async () => {
    const h = harness(); h.button('Load captures').click(); await flush(); h.button('View capture').click(); await flush();
    expect(h.root.querySelector('img')?.getAttribute('src')).toBe('blob:private-preview');
    expect(h.client.openReview).not.toHaveBeenCalled(); h.button('Close preview').click();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-preview'); expect(h.root.querySelector('img')).toBeNull();
  });
  it('removes private captions and bytes when the account changes or the page hides', async () => {
    const h = harness(); h.button('Load captures').click(); await flush(); h.button('View capture').click(); await flush();
    h.client.authorization.connectionId = 'connection-b'; await vi.advanceTimersByTimeAsync(1000);
    expect(h.root.textContent).not.toContain(row.caption); expect(URL.revokeObjectURL).toHaveBeenCalled();
    h.button('Load captures').click(); await flush();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
    expect(h.root.textContent).not.toContain(row.caption);
  });
  it('reports a decoding failure and releases the unusable media', async () => {
    const h = harness(); h.button('Load captures').click(); await flush(); h.button('View capture').click(); await flush();
    h.root.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(h.root.querySelector('img')).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(h.root.textContent).toContain('could not be displayed');
  });
  it('hides a preview when the server recheck fails', async () => {
    const h = harness(); h.button('Load captures').click(); await flush(); h.button('View capture').click(); await flush();
    h.client.checkCapturePreview.mockRejectedValueOnce(new Error('revoked')); await vi.advanceTimersByTimeAsync(15000);
    expect(h.root.querySelector('img')).toBeNull(); expect(h.root.textContent).toContain('Access changed');
    expect(h.root.textContent).not.toContain(row.caption);
  });
  it('ignores late private media after clear and cancels its pending request', async () => {
    const h = harness(); h.button('Load captures').click(); await flush();
    let resolve!: (value: Blob) => void;
    h.client.getCapturePreview.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    h.button('View capture').click(); await flush(); h.gallery.clear(); resolve(new Blob(['late'])); await flush();
    expect(h.root.querySelector('img')).toBeNull(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('shows honest empty and error states and stops timers on disposal', async () => {
    const h = harness(); h.client.listCaptures.mockResolvedValueOnce({ captures: [], nextCursor: null });
    h.button('Load captures').click(); await flush(); expect(h.root.textContent).toContain('Send a capture to get started');
    h.client.listCaptures.mockRejectedValueOnce(new Error('Try again later')); h.button('Load captures').click(); await flush(); expect(h.root.textContent).toContain('Try again later');
    h.gallery.dispose(); expect(h.root.childNodes).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
});
