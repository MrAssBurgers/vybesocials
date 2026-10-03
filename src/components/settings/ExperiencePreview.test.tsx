import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExperiencePreview } from './ExperiencePreview';

const { preferences, feedback } = vi.hoisted(() => ({
  preferences: { reducedMotion: false, motionIntensity: 'normal', isLowPerformance: false },
  feedback: { haptic: vi.fn(), sound: vi.fn() },
}));
vi.mock('@/lib/theme', () => ({ useTheme: () => preferences }));
vi.mock('@/providers/PlatformProvider', () => ({ usePlatformContext: () => preferences }));
vi.mock('@/lib/haptics', () => ({ haptics: { like: feedback.haptic } }));
vi.mock('@/lib/premiumSounds', () => ({ premiumSounds: { toggle: feedback.sound } }));

beforeEach(() => {
  preferences.reducedMotion = false;
  preferences.isLowPerformance = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

it('only triggers feedback after interaction and updates the accessible pressed state', () => {
  const { container } = render(<ExperiencePreview />);
  expect(feedback.haptic).not.toHaveBeenCalled();
  expect(feedback.sound).not.toHaveBeenCalled();
  const button = screen.getByRole('button', { name: 'Preview like feedback' });
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(feedback.haptic).toHaveBeenCalledOnce();
  expect(feedback.sound).toHaveBeenCalledOnce();
  expect(container.querySelector('.border-2')).not.toBeNull();
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(container.querySelector('.border-2')).toBeNull();
});

it('drops the animated ring immediately when reduced motion or low-performance mode changes', () => {
  const { container, rerender } = render(<ExperiencePreview />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview like feedback' }));
  preferences.reducedMotion = true;
  rerender(<ExperiencePreview />);
  expect(container.querySelector('.border-2')).toBeNull();
  preferences.reducedMotion = false;
  preferences.isLowPerformance = true;
  rerender(<ExperiencePreview />);
  expect(container.querySelector('.border-2')).toBeNull();
  expect(screen.getByRole('button', { name: 'Preview like feedback' })).toHaveAttribute('aria-pressed', 'true');
});
