import { afterEach, describe, expect, it, vi } from 'vitest';
import { MINI_APP_TEMPLATES } from './templates';
import { downloadMiniAppFile, MINI_APP_FILE_BYTES, parseMiniAppFile, readMiniAppFile, serializeMiniAppFile } from './sourceFile';

const source = MINI_APP_TEMPLATES[0].source;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('portable mini-app source files', () => {
  it('round trips exact unfinished source and excludes account/publication metadata', () => {
    const unfinished = { ...source, title: '', description: ' Keep whitespace ', html: '', javascript: '', css: '/* draft */' };
    const text = serializeMiniAppFile({ ...unfinished, owner_id: 'private', id: 'server-id', publication_revision: 'hidden' } as typeof source);
    expect(parseMiniAppFile(text)).toEqual(unfinished);
    expect(text).not.toContain('private'); expect(text).not.toContain('server-id'); expect(text).not.toContain('hidden');
  });
  it('treats executable-looking source as inert text, including BOM files', () => {
    const code = { ...source, html: '</script><script>throw new Error("never run")</script>', javascript: 'globalThis.shouldNeverRun = true;' };
    expect(parseMiniAppFile('\uFEFF' + serializeMiniAppFile(code))).toEqual(code);
    expect((globalThis as any).shouldNeverRun).toBeUndefined();
  });
  it.each([
    { format: 'vybe-mini-app', version: 2, source },
    { format: 'vybe-mini-app', version: 1, source, owner_id: 'injected' },
    { format: 'vybe-mini-app', version: 1, source: { ...source, owner_id: 'injected' } },
    { format: 'vybe-mini-app', version: 1, source: { ...source, html: 12 } },
    { format: 'vybe-mini-app', version: 1, source: { ...source, category: 'admin' } },
    { format: 'vybe-mini-app', version: 1, source: { ...source, title: 'x'.repeat(61) } },
    { format: 'vybe-mini-app', version: 1, source: { ...source, javascript: 'x'.repeat(100001) } },
  ])('rejects unsupported shapes and limits %#', value => expect(() => parseMiniAppFile(JSON.stringify(value))).toThrow());
  it('bounds file reads before allocating the payload and rejects invalid UTF-8', async () => {
    const arrayBuffer = vi.fn();
    await expect(readMiniAppFile({ size: MINI_APP_FILE_BYTES + 1, arrayBuffer } as any)).rejects.toThrow('1 MB');
    expect(arrayBuffer).not.toHaveBeenCalled();
    await expect(readMiniAppFile({ size: 2, arrayBuffer: async () => new Uint8Array([0xc3, 0x28]).buffer } as any)).rejects.toThrow('UTF-8');
    await expect(readMiniAppFile({ size: 2, arrayBuffer: async () => new Uint8Array(MINI_APP_FILE_BYTES + 1).buffer } as any)).rejects.toThrow('1 MB');
  });
  it('reads a valid UTF-8 file and handles malformed JSON', async () => {
    const bytes = new TextEncoder().encode(serializeMiniAppFile(source));
    await expect(readMiniAppFile({ size: bytes.length, arrayBuffer: async () => bytes.buffer } as any)).resolves.toEqual(source);
    expect(() => parseMiniAppFile('{bad')).toThrow('valid Vybe');
    expect(() => parseMiniAppFile(' '.repeat(MINI_APP_FILE_BYTES + 1))).toThrow('1 MB');
  });
  it('downloads with a bounded safe filename and releases the object URL', () => {
    vi.useFakeTimers();
    const create = vi.fn((_blob: Blob) => 'blob:local-test'), revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      expect(this.download).toBe('vybe-a-test.json'); expect(this.href).toBe('blob:local-test');
    });
    downloadMiniAppFile({ ...source, title: '../../ A test \\ ' });
    expect(click).toHaveBeenCalledOnce(); expect(create.mock.calls[0][0].type).toBe('application/json;charset=utf-8');
    expect(document.querySelector('a[download]')).toBeNull(); expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000); expect(revoke).toHaveBeenCalledWith('blob:local-test');
  });
});
