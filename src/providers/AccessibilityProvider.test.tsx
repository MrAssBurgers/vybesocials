import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { AccessibilityProvider, useAccessibility } from './AccessibilityProvider';

const native = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/lib/nativePerfMode', () => ({ isNativePerfMode: () => native.enabled }));
vi.mock('@/lib/despiaBridge', () => ({ isNativeAppShell: () => false }));
vi.mock('@/lib/theme/themePrepaint', () => ({ reinforceSplashTheme: vi.fn() }));
const queries = new Map<string, { matches: boolean; listeners: Set<(event: { matches: boolean }) => void> }>();
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider><AccessibilityProvider>{children}</AccessibilityProvider></ThemeProvider>;
function preference(query: string, matches: boolean) {
  const media = queries.get(query)!;
  act(() => { media.matches = matches; media.listeners.forEach(listener => listener({ matches })); });
}
beforeEach(() => {
  queries.clear(); native.enabled = false; document.documentElement.className = '';
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    if (!queries.has(query)) queries.set(query, { matches: false, listeners: new Set() });
    const media = queries.get(query)!;
    return { get matches() { return media.matches; },
      addEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => media.listeners.add(listener),
      removeEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => media.listeners.delete(listener) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('shared accessibility preferences', () => {
  it('keeps saved Reduce Motion active across system preference changes', () => {
    localStorage.setItem('xd-reduced-motion', 'true');
    const { result } = renderHook(() => ({ a11y: useAccessibility(), theme: useTheme() }), { wrapper });
    expect(result.current.a11y.reduceMotion).toBe(true);
    preference('(prefers-reduced-motion: reduce)', true);
    preference('(prefers-reduced-motion: reduce)', false);
    expect(result.current.a11y.reduceMotion).toBe(true);
    expect(document.documentElement).toHaveClass('reduce-motion');
    act(() => result.current.theme.followSystemMotion());
    expect(result.current.a11y.reduceMotion).toBe(false);
    expect(document.documentElement).not.toHaveClass('reduce-motion');
  });
  it('applies live in-app changes to accessibility consumers and CSS together', () => {
    const { result } = renderHook(() => ({ a11y: useAccessibility(), theme: useTheme() }), { wrapper });
    act(() => result.current.theme.setReducedMotion(true));
    expect(result.current.a11y.reduceMotion).toBe(true);
    expect(document.documentElement).toHaveClass('reduce-motion');
    act(() => result.current.theme.setReducedMotion(false));
    expect(result.current.a11y.reduceMotion).toBe(false);
  });
  it('keeps native decorative restraint separate from the user accessibility class', () => {
    native.enabled = true;
    const { result } = renderHook(useAccessibility, { wrapper });
    expect(result.current.reduceMotion).toBe(true);
    expect(document.documentElement).not.toHaveClass('reduce-motion');
  });
  it('updates contrast and removes listeners on unmount', () => {
    const { result, unmount } = renderHook(useAccessibility, { wrapper });
    preference('(prefers-contrast: more)', true);
    expect(result.current.prefersContrast).toBe(true);
    expect(document.documentElement).toHaveClass('high-contrast');
    unmount();
    expect([...queries.values()].every(value => value.listeners.size === 0)).toBe(true);
    expect(document.documentElement).not.toHaveClass('high-contrast');
  });
});
