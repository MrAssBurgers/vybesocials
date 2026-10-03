import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './theme';
import { GlassIntensityProvider, useGlassIntensity } from '@/components/ui/glass/GlassIntensityProvider';
import { updateSoundSettings } from './premiumSounds';

vi.mock('@/lib/despiaBridge', () => ({ isNativeAppShell: () => false }));
vi.mock('@/lib/theme/themePrepaint', () => ({ reinforceSplashTheme: vi.fn() }));

const queries = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider><GlassIntensityProvider>{children}</GlassIntensityProvider></ThemeProvider>
);

function systemPreference(query: string, matches: boolean) {
  const media = queries.get(query)!;
  act(() => { media.matches = matches; media.listeners.forEach(listener => listener()); });
}

beforeEach(() => {
  queries.clear();
  document.documentElement.className = '';
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    if (!queries.has(query)) queries.set(query, { matches: false, listeners: new Set() });
    const media = queries.get(query)!;
    return {
      get matches() { return media.matches; },
      addEventListener: (_event: string, listener: () => void) => media.listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => media.listeners.delete(listener),
    };
  }));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('appearance preferences', () => {
  it('follows live system reduced motion without freezing it into storage on mount', () => {
    const { result } = renderHook(useTheme, { wrapper });
    expect(result.current.reducedMotion).toBe(false);
    expect(localStorage.getItem('xd-reduced-motion')).toBeNull();
    systemPreference('(prefers-reduced-motion: reduce)', true);
    expect(result.current.reducedMotion).toBe(true);
    expect(document.documentElement).toHaveClass('reduce-motion');
    systemPreference('(prefers-reduced-motion: reduce)', false);
    expect(result.current.reducedMotion).toBe(false);
    act(() => result.current.setReducedMotion(true));
    expect(localStorage.getItem('xd-reduced-motion')).toBe('true');
    act(() => result.current.followSystemMotion());
    expect(result.current.followsSystemMotion).toBe(true);
    expect(result.current.reducedMotion).toBe(false);
  });

  it('keeps OS accessibility enabled even with a saved false preference', () => {
    localStorage.setItem('xd-reduced-motion', 'false');
    const { result } = renderHook(useTheme, { wrapper });
    systemPreference('(prefers-reduced-motion: reduce)', true);
    act(() => result.current.setReducedMotion(false));
    expect(result.current.reducedMotion).toBe(true);
  });

  it('repairs corrupt theme and glass values and synchronizes both glass consumers', () => {
    localStorage.setItem('xd-theme', 'invalid');
    localStorage.setItem('vybe-glass-intensity', 'invalid');
    const { result } = renderHook(() => ({ theme: useTheme(), glass: useGlassIntensity() }), { wrapper });
    expect(result.current.theme.theme).toBe('dark');
    expect(result.current.glass.getBlur()).toBe('16px');
    act(() => result.current.glass.setIntensity('max'));
    expect(result.current.theme.glassIntensity).toBe('max');
    expect(document.documentElement.dataset.glassIntensity).toBe('max');
    act(() => result.current.theme.setGlassIntensity('calm'));
    expect(result.current.glass.intensity).toBe('calm');
  });

  it('synchronizes settings changed by another component or browser tab', () => {
    const { result } = renderHook(useTheme, { wrapper });
    act(() => updateSoundSettings({ master: false }));
    expect(result.current.soundsEnabled).toBe(false);
    act(() => {
      localStorage.setItem('xd-theme', 'light');
      window.dispatchEvent(new StorageEvent('storage', { key: 'xd-theme' }));
    });
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement).toHaveClass('light');
    act(() => {
      localStorage.setItem('xd-reduced-motion', 'true');
      window.dispatchEvent(new StorageEvent('storage', { key: 'xd-reduced-motion' }));
      localStorage.setItem('vybe-motion-intensity', 'calm');
      window.dispatchEvent(new StorageEvent('storage', { key: 'vybe-motion-intensity' }));
    });
    expect(result.current.reducedMotion).toBe(true);
    expect(result.current.motionIntensity).toBe('calm');
    expect(document.documentElement).toHaveClass('reduce-motion', 'calm-motion');
  });

  it('remains usable when browser storage is blocked', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Blocked'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full'); });
    const { result } = renderHook(() => ({ theme: useTheme(), glass: useGlassIntensity() }), { wrapper });
    act(() => {
      result.current.theme.setTheme('light');
      result.current.theme.setHapticsEnabled(false);
      result.current.glass.setIntensity('calm');
    });
    expect(result.current.theme.resolvedTheme).toBe('light');
    expect(result.current.theme.hapticsEnabled).toBe(false);
    expect(result.current.glass.getBlur()).toBe('8px');
  });
});
