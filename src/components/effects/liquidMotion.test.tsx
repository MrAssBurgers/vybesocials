import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VybeLiquidBackground } from './VybeLiquidBackground';
import { VybeLiquidTouchOverlay } from './VybeLiquidTouchOverlay';
import { triggerVybeLiquidTouch } from '@/lib/vybeLiquidTouchBridge';
import { isVybeLiquidTouchSystemActive } from '@/lib/liquidShellState';

const preferences = vi.hoisted(() => ({ reducedMotion: false }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ resolvedTheme: 'dark', ...preferences }) }));
vi.mock('@/lib/nativePerfMode', () => ({ isNativePerfMode: () => false }));
vi.mock('@/lib/haptics', () => ({ haptics: { select: vi.fn() } }));
beforeEach(() => { preferences.reducedMotion = false; document.documentElement.className = ''; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('liquid effects motion preferences', () => {
  it('removes running tap effects and listeners when Reduce Motion is enabled, then restores optional effects', () => {
    const screen = render(<VybeLiquidTouchOverlay />);
    act(() => triggerVybeLiquidTouch(20, 40));
    expect(screen.container.querySelector('.vybe-liquid-touch--play')).toBeTruthy();
    preferences.reducedMotion = true;
    screen.rerender(<VybeLiquidTouchOverlay zIndex={5011} />);
    expect(screen.container.querySelector('.vybe-liquid-touch-layer')).toBeNull();
    expect(isVybeLiquidTouchSystemActive()).toBe(false);
    expect(document.documentElement).not.toHaveClass('vybe-liquid-touch-active');
    preferences.reducedMotion = false;
    screen.rerender(<VybeLiquidTouchOverlay />);
    expect(screen.container.querySelector('.vybe-liquid-touch-layer')).toBeTruthy();
    expect(screen.container.querySelector('.vybe-liquid-touch--play')).toBeNull();
    expect(isVybeLiquidTouchSystemActive()).toBe(true);
  });
  it('cancels pointer boost and preserves still color when reduced motion changes', () => {
    const screen = render(<VybeLiquidBackground />);
    fireEvent.pointerDown(window, { clientX: 40, clientY: 80 });
    const background = screen.container.querySelector('.vybe-liquid-bg') as HTMLElement;
    expect(background).toHaveClass('vybe-liquid-bg--boost');
    preferences.reducedMotion = true;
    screen.rerender(<VybeLiquidBackground className="preference-change" />);
    expect(background).toHaveClass('vybe-liquid-bg--static');
    expect(background).not.toHaveClass('vybe-liquid-bg--boost');
    expect(background.style.getPropertyValue('--pull-x')).toBe('0px');
    expect(screen.container.querySelector('.vybe-liquid-touch')).toBeNull();
    expect(screen.container.querySelector('.vybe-liquid-mesh')).toBeTruthy();
    fireEvent.pointerDown(window, { clientX: 40, clientY: 80 });
    expect(background).not.toHaveClass('vybe-liquid-bg--boost');
    preferences.reducedMotion = false;
    screen.rerender(<VybeLiquidBackground className="restored" />);
    expect(background).not.toHaveClass('vybe-liquid-bg--static');
  });
  it('does not request sensor permission for decorative parallax', () => {
    const requestPermission = vi.fn();
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission });
    render(<VybeLiquidBackground />);
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('coalesces orientation writes and cancels the pending frame on preference change', () => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    const request = vi.fn(() => 42); const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', cancel);
    const screen = render(<VybeLiquidBackground />);
    fireEvent(window, new Event('deviceorientation'));
    fireEvent(window, new Event('deviceorientation'));
    expect(request).toHaveBeenCalledTimes(1);
    preferences.reducedMotion = true;
    screen.rerender(<VybeLiquidBackground className="preference-change" />);
    expect(cancel).toHaveBeenCalledWith(42);
    fireEvent(window, new Event('deviceorientation'));
    expect(request).toHaveBeenCalledTimes(1);
  });
});
