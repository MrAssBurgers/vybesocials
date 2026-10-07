import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WelcomeBackSplash,
  knownAccountAvatarSlot,
  welcomeCenter,
  welcomeFlyTarget,
  welcomeSwirlFrames,
  WELCOME_AVATAR_SIZE,
} from './WelcomeBackSplash';

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('WelcomeBackSplash', () => {
  afterEach(() => {
    cleanup();
    document.body.querySelectorAll('[data-auth-shell], [data-account-avatar]').forEach((node) => node.remove());
    mockReducedMotion(false);
  });

  it('shows the profile picture without the welcome chip or a scroll lock', () => {
    render(
      <WelcomeBackSplash
        username="vybe_tester"
        avatarUrl="https://example.com/avatar.jpg"
        profileId="profile-1"
        onComplete={() => {}}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Welcome back');
    expect(screen.queryByText('@vybe_tester')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss welcome message' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass('welcome-back-visible');
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(screen.getByRole('status').className).not.toContain('-translate-x-1/2');
    const avatar = document.querySelector('[data-welcome-avatar]');
    expect(avatar).toBeTruthy();
    const style = avatar?.getAttribute('style') ?? '';
    expect(style).toContain('left: 0');
    expect(style).toContain('top: 0');
    expect(style).toContain('translateX');
    expect(style).toContain('translateY');
  });

  it('stays off the sign-in sheet until that screen is gone', async () => {
    const shell = document.createElement('div');
    shell.setAttribute('data-auth-shell', '');
    document.body.appendChild(shell);

    render(<WelcomeBackSplash username="vybe_tester" onComplete={() => {}} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    shell.remove();
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.queryByText('@vybe_tester')).not.toBeInTheDocument();
  });

  it('uses the account avatar when it is on screen and skips the swirl for reduced motion', async () => {
    mockReducedMotion(true);
    const slot = document.createElement('div');
    slot.setAttribute('data-account-avatar', '');
    slot.getBoundingClientRect = () => ({
      x: 300,
      y: 620,
      left: 300,
      top: 620,
      right: 328,
      bottom: 648,
      width: 28,
      height: 28,
      toJSON() { return {}; },
    });
    document.body.appendChild(slot);

    render(<WelcomeBackSplash username="vybe_tester" onComplete={() => {}} />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveAttribute('data-welcome-motion', 'direct'));
    const expected = welcomeFlyTarget(
      { width: window.innerWidth, height: window.innerHeight },
      { left: 300, top: 620, width: 28, height: 28 },
    );
    await waitFor(() => {
      expect(screen.getByRole('status').getAttribute('data-fly-x')).toBe(String(Math.round(expected.x)));
      expect(screen.getByRole('status').getAttribute('data-fly-y')).toBe(String(Math.round(expected.y)));
      expect(screen.getByRole('status').getAttribute('data-fly-fallback')).toBe('false');
    });
    expect(screen.getByRole('status').getAttribute('data-welcome-phase')).not.toBe('swirl');
  });

  it('plans a swirl that starts and ends on center, then a fly into the account slot', () => {
    const viewport = { width: 475, height: 751 };
    const center = welcomeCenter(viewport);
    const frames = welcomeSwirlFrames(center, viewport);
    expect(frames.x[0]).toBeCloseTo(center.x, 4);
    expect(frames.y[0]).toBeCloseTo(center.y, 4);
    expect(frames.x.at(-1)).toBeCloseTo(center.x, 4);
    expect(frames.y.at(-1)).toBeCloseTo(center.y, 4);
    const mid = Math.floor(frames.x.length / 2);
    const drift = Math.hypot(frames.x[mid] - center.x, frames.y[mid] - center.y);
    expect(drift).toBeGreaterThan(80);

    const phone = knownAccountAvatarSlot(475, 751);
    expect(phone.top).toBeGreaterThan(600);
    expect(phone.left).toBeGreaterThan(300);
    const desktop = knownAccountAvatarSlot(1280, 800);
    expect(desktop.left).toBeLessThan(80);
    expect(desktop.top).toBeLessThan(120);

    const landed = welcomeFlyTarget(viewport, null);
    expect(landed.usedFallback).toBe(true);
    expect(landed.x + WELCOME_AVATAR_SIZE / 2).toBeCloseTo(phone.left + phone.width / 2, 4);
  });
});
