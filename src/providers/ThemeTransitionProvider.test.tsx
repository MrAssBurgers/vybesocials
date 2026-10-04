import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeTransitionProvider, useThemeTransition } from './ThemeTransitionProvider';

const preferences = vi.hoisted(() => ({ reducedMotion: false, motionIntensity: 'normal', isLowPerformance: false }));
vi.mock('@/lib/theme', () => ({ useTheme: () => preferences }));
vi.mock('@/providers/PlatformProvider', () => ({ usePlatformContext: () => preferences }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode><ThemeTransitionProvider>{children}</ThemeTransitionProvider></StrictMode>
);
const glow = () => document.querySelector('[data-theme-transition]');

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(preferences, { reducedMotion: false, motionIntensity: 'normal', isLowPerformance: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('theme selection feedback', () => {
  it('applies selections immediately and exactly once, without delayed stale writes', () => {
    const { result } = renderHook(useThemeTransition, { wrapper });
    const writes: string[] = [];
    act(() => {
      result.current.triggerTransition('180 70% 50%', undefined, () => writes.push('ocean'));
      expect(writes).toEqual(['ocean']);
      result.current.triggerTransition('280 70% 50%', undefined, () => writes.push('neon'));
      expect(writes).toEqual(['ocean', 'neon']);
    });
    expect(result.current.isTransitioning).toBe(true);
    expect(glow()).toHaveAttribute('aria-hidden', 'true');
    expect(glow()).toHaveClass('pointer-events-none');
    expect(glow()?.getAttribute('style')).toContain('rgba(157, 38, 217, 0.22)');
    act(() => vi.advanceTimersByTime(500));
    expect(writes).toEqual(['ocean', 'neon']);
    expect(result.current.isTransitioning).toBe(false);
    expect(glow()).toBeNull();
  });

  it.each(['reducedMotion', 'isLowPerformance'] as const)('applies immediately with no overlay when %s is on', (key) => {
    preferences[key] = true;
    const { result } = renderHook(useThemeTransition, { wrapper });
    const apply = vi.fn();
    act(() => result.current.triggerTransition(undefined, undefined, apply));
    expect(apply).toHaveBeenCalledOnce();
    expect(result.current.isTransitioning).toBe(false);
    expect(glow()).toBeNull();
  });

  it.each(['reducedMotion', 'isLowPerformance'] as const)('cancels active feedback on live %s changes without replaying selection', (key) => {
    const { result, rerender } = renderHook(useThemeTransition, { wrapper });
    const apply = vi.fn();
    act(() => result.current.triggerTransition(undefined, undefined, apply));
    preferences[key] = true;
    rerender();
    expect(glow()).toBeNull();
    expect(result.current.isTransitioning).toBe(false);
    preferences[key] = false;
    rerender();
    expect(glow()).toBeNull();
    act(() => vi.advanceTimersByTime(500));
    expect(apply).toHaveBeenCalledOnce();
  });

  it('keeps calm feedback brief and lets a fresh choice finish its own animation', () => {
    preferences.motionIntensity = 'calm';
    const { result } = renderHook(useThemeTransition, { wrapper });
    act(() => result.current.triggerTransition());
    expect(glow()).toHaveAttribute('data-theme-transition', 'calm');
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.triggerTransition());
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.isTransitioning).toBe(true);
    act(() => vi.advanceTimersByTime(80));
    expect(result.current.isTransitioning).toBe(false);
  });

  it('does not leave delayed selection work after unmount', () => {
    const { result, unmount } = renderHook(useThemeTransition, { wrapper });
    const apply = vi.fn();
    act(() => result.current.triggerTransition(undefined, undefined, apply));
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(apply).toHaveBeenCalledOnce();
    expect(glow()).toBeNull();
  });
});
