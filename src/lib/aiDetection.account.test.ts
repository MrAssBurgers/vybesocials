import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: state.invoke } } }));
import { detectAIContent } from './aiDetection';
beforeEach(() => { state.invoke.mockReset(); }); afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('AI metadata account-lifetime guard', () => {
  it('does not dispatch an old image after deferred extraction crosses an account change', async () => {
    const image = { width: 10, height: 10, onload: () => {}, src: '' };
    function FakeImage() { return image; }
    vi.stubGlobal('Image', FakeImage); URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,fixture');
    let epoch = 1; const guard = () => { if (epoch !== 1) throw new Error('Account changed'); };
    const pending = detectAIContent('post-id', new File(['image'], 'photo.png', { type: 'image/png' }), 'Caption', guard);
    epoch = 3; image.onload(); await expect(pending).rejects.toThrow('Account changed'); expect(state.invoke).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
  it('refuses stale completed responses without altering server state or returning old diagnostics', async () => {
    let current = true; state.invoke.mockImplementation(async () => { current = false; return { data: { is_ai: true }, error: null }; });
    await expect(detectAIContent('post-id', undefined, 'Caption', () => { if (!current) throw new Error('Account changed'); })).rejects.toThrow('Account changed');
    expect(state.invoke).toHaveBeenCalledOnce();
  });
  it('keeps the compatible unguarded call available', async () => {
    state.invoke.mockResolvedValue({ data: { is_ai: false, confidence: 0.1, reason: 'Synthetic result' }, error: null });
    await expect(detectAIContent('post-id', undefined, 'Caption')).resolves.toMatchObject({ is_ai: false });
  });
});
