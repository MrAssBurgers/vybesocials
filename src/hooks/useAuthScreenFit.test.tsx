import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ native: false, coarse: false, os: 'android' }));
vi.mock('@/lib/despiaBridge', () => ({ isNativeAppShell: () => state.native, getRuntimeOs: () => state.os }));
import { useAuthScreenFit } from './useAuthScreenFit';
function Form() {
  const fit = useAuthScreenFit(true);
  return <><div ref={fit.contentRef} data-testid="card" style={{ transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined }}><input aria-label="Email" /></div><output>{JSON.stringify({ scale: fit.scale, scroll: fit.scrollWhenTall })}</output></>;
}
let measure: ReturnType<typeof vi.spyOn>, observe: ReturnType<typeof vi.fn>;
beforeEach(() => {
  state.native = false; state.coarse = false;
  vi.stubGlobal('matchMedia', () => ({ matches: state.coarse }));
  observe = vi.fn(); vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect() {} });
  measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 1200 } as DOMRect);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('auth card mobile keyboard layout', () => {
  it.each(['native', 'touch'])('keeps %s forms at natural size without forced measurement on resize or focus', kind => {
    state.native = kind === 'native'; state.coarse = kind === 'touch'; render(<Form />);
    expect(screen.getByText('{"scale":1,"scroll":true}')).toBeTruthy();
    act(() => { screen.getByLabelText('Email').focus(); window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('orientationchange')); });
    expect(measure).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled();
    expect(screen.getByTestId('card').style.transform).toBe('');
  });
  it('retains desktop shrink fitting for a tall form', () => {
    render(<Form />);
    expect(measure).toHaveBeenCalled(); expect(observe).toHaveBeenCalledOnce();
    expect(screen.getByTestId('card').style.transform).toMatch(/^scale\(0\./);
  });
});
