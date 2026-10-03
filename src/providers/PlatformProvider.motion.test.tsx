import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlatformProvider } from './PlatformProvider';

const { platform } = vi.hoisted(() => ({ platform: { device: 'desktop' } }));
vi.mock('@/hooks/usePlatform', () => ({ usePlatform: () => ({
  platform: 'windows', device: platform.device, performanceTier: 'medium',
  prefersReducedMotion: false, hasNotch: false, connectionType: 'fast',
}) }));
vi.mock('@/lib/safeAreaInsets', () => ({ applySafeAreaCssVars: () => () => {} }));
vi.mock('@/lib/deviceDetection', () => ({ isSamsungFoldableUa: () => false }));
afterEach(cleanup);

it('preserves the in-app reduced motion class across resize and provider cleanup', () => {
  const { rerender, unmount } = render(<PlatformProvider><div /></PlatformProvider>);
  document.documentElement.classList.add('reduce-motion');
  platform.device = 'mobile';
  rerender(<PlatformProvider><div /></PlatformProvider>);
  expect(document.documentElement).toHaveClass('reduce-motion');
  expect(document.documentElement).toHaveClass('device-mobile');
  unmount();
  expect(document.documentElement).toHaveClass('reduce-motion');
});
