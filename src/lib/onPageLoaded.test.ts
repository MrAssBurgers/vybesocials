import { afterEach, describe, expect, it, vi } from 'vitest';
import { onPageLoaded } from './onPageLoaded';

afterEach(() => vi.restoreAllMocks());

describe('deferred page setup', () => {
  it('runs once when an async boot import finishes after page load', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    const setup = vi.fn();
    onPageLoaded(setup);
    expect(setup).not.toHaveBeenCalled();
    await Promise.resolve();
    window.dispatchEvent(new Event('load'));
    expect(setup).toHaveBeenCalledOnce();
  });

  it('waits for load when the document is still loading', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
    const setup = vi.fn();
    onPageLoaded(setup);
    await Promise.resolve();
    expect(setup).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    window.dispatchEvent(new Event('load'));
    expect(setup).toHaveBeenCalledOnce();
  });

  it.each(['complete', 'loading'] as const)('cancels pending setup for %s documents', async state => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue(state);
    const setup = vi.fn();
    const cancel = onPageLoaded(setup);
    cancel();
    await Promise.resolve();
    window.dispatchEvent(new Event('load'));
    expect(setup).not.toHaveBeenCalled();
  });
});
