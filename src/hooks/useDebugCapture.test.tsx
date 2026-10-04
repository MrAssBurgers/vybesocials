import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ network: vi.fn(), event: vi.fn() }));
vi.mock('@/lib/debugLogger', () => ({ logNetwork: mocks.network, logEvent: mocks.event }));
import { useDebugCapture } from './useDebugCapture';
const fetchMock = vi.fn();
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('network diagnostics preserve actual request outcomes', () => {
  it('accepts URL objects and returns the identical response without consuming it', async () => {
    const url = new URL('https://example.test/local-check');
    const response = new Response('unchanged');
    fetchMock.mockResolvedValue(response);
    renderHook(useDebugCapture);
    expect(await fetch(url)).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(url, undefined);
    expect(response.bodyUsed).toBe(false);
    expect(mocks.network).toHaveBeenCalledWith(expect.objectContaining({ url: url.href, method: 'GET', status: 200 }));
  });
  it('records a Request method and preserves explicit init overrides', async () => {
    const request = new Request('https://example.test/local-check', { method: 'POST', body: 'unchanged' });
    fetchMock.mockResolvedValue(new Response());
    renderHook(useDebugCapture);
    await fetch(request);
    expect(mocks.network).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'POST' }));
    const init = { method: 'PUT', body: 'override' };
    await fetch(request, init);
    expect(fetchMock).toHaveBeenLastCalledWith(request, init);
    expect(mocks.network).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'PUT' }));
    expect(request.bodyUsed).toBe(false);
  });
  it('returns successful responses even when diagnostics fail', async () => {
    const response = new Response('valid');
    fetchMock.mockResolvedValue(response);
    mocks.network.mockImplementation(() => { throw new Error('broken debug subscriber'); });
    renderHook(useDebugCapture);
    expect(await fetch('/local-check')).toBe(response);
  });
  it('preserves the original network rejection even when diagnostics fail', async () => {
    const failure = new TypeError('original transport failure');
    fetchMock.mockRejectedValue(failure);
    mocks.network.mockImplementation(() => { throw new Error('broken debug subscriber'); });
    renderHook(useDebugCapture);
    await expect(fetch('/local-check')).rejects.toBe(failure);
  });
});
