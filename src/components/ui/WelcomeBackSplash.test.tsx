import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  WelcomeBackSplash,
  WELCOME_ACCOUNT_PENDING,
  WELCOME_AVATAR_SIZE,
  knownAccountAvatarSlot,
  readAccountAvatarRect,
  welcomeCenter,
  welcomeFlyTarget,
  welcomeReturnNotices,
  welcomeSwirlFrames,
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

function root() {
  const node = document.querySelector('[data-welcome-root]');
  if (!node) throw new Error('welcome root missing');
  return node;
}

function accountSlot(box: { left: number; top: number; width: number; height: number }) {
  const slot = document.createElement('div');
  slot.setAttribute('data-account-avatar', '');
  slot.getBoundingClientRect = () => ({
    x: box.left,
    y: box.top,
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
    width: box.width,
    height: box.height,
    toJSON() { return {}; },
  });
  document.body.appendChild(slot);
  return slot;
}

describe('WelcomeBackSplash', () => {
  afterEach(() => {
    cleanup();
    toast.dismiss();
    document.body.querySelectorAll('[data-auth-shell], [data-account-avatar]').forEach((node) => node.remove());
    document.body.classList.remove(WELCOME_ACCOUNT_PENDING, 'welcome-back-splash', 'welcome-back-visible');
    mockReducedMotion(false);
  });

  it('holds a centered photo, welcome copy, and Close without a chip or scroll lock', () => {
    render(
      <WelcomeBackSplash
        username="vybe_tester"
        avatarUrl="https://example.com/avatar.jpg"
        profileId="profile-1"
        onComplete={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByText('@vybe_tester')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss welcome message' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass('welcome-back-visible');
    expect(document.body).toHaveClass(WELCOME_ACCOUNT_PENDING);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(root().className).not.toContain('-translate-x-1/2');
    expect(screen.getByRole('button', { name: 'Close' }).className).not.toContain('-translate-x-1/2');
    const avatar = document.querySelector('[data-welcome-avatar]');
    expect(avatar).toBeTruthy();
    expect(avatar?.textContent).not.toMatch(/V/);
    const style = avatar?.getAttribute('style') ?? '';
    expect(style).toContain('left: 0');
    expect(style).toContain('top: 0');
    expect(style).toContain('translateX');
    expect(style).toContain('translateY');
    expect(root()).toHaveAttribute('data-welcome-phase', 'hold');
  });

  it('shows existing return notices under the photo and skips a duplicate welcome line', () => {
    toast.success('Welcome back! ✨');
    toast.message('Your new Daily Brief is ready', {
      description: 'Tap the brief on your home screen to read it.',
    });
    toast.error('Could not save that draft');

    render(<WelcomeBackSplash username="vybe_tester" onComplete={() => {}} />);

    const list = screen.getByRole('list');
    expect(list).toHaveTextContent('Your new Daily Brief is ready');
    expect(list).toHaveTextContent('Tap the brief on your home screen to read it.');
    expect(list).not.toHaveTextContent('Welcome back');
    expect(list).not.toHaveTextContent('Could not save');
    expect(screen.getAllByText('Welcome back')).toHaveLength(1);
  });

  it('stays off the sign-in sheet until that screen is gone', async () => {
    const shell = document.createElement('div');
    shell.setAttribute('data-auth-shell', '');
    document.body.appendChild(shell);

    render(<WelcomeBackSplash username="vybe_tester" onComplete={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass(WELCOME_ACCOUNT_PENDING);

    shell.remove();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.queryByText('@vybe_tester')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('does not swirl until Close, then lands on the account avatar with confetti', async () => {
    accountSlot({ left: 300, top: 620, width: 28, height: 28 });
    const onComplete = vi.fn();
    render(<WelcomeBackSplash username="vybe_tester" avatarUrl="https://example.com/a.jpg" onComplete={onComplete} />);

    await waitFor(() => expect(root()).toHaveAttribute('data-welcome-motion', 'swirl'));
    expect(root()).toHaveAttribute('data-welcome-phase', 'hold');
    expect(document.querySelector('[data-welcome-confetti]')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    const expected = welcomeFlyTarget(
      { width: window.innerWidth, height: window.innerHeight },
      { left: 300, top: 620, width: 28, height: 28 },
    );
    await waitFor(() => {
      expect(root().getAttribute('data-fly-x')).toBe(String(Math.round(expected.x)));
      expect(root().getAttribute('data-fly-y')).toBe(String(Math.round(expected.y)));
      expect(root().getAttribute('data-fly-fallback')).toBe('false');
    }, { timeout: 4000 });

    await waitFor(() => {
      expect(document.querySelector('[data-welcome-confetti]')).toBeTruthy();
      expect(document.body).not.toHaveClass(WELCOME_ACCOUNT_PENDING);
    }, { timeout: 4000 });
    expect(root().getAttribute('data-welcome-phase')).not.toBe('hold');
  });

  it('skips the swirl and confetti when motion is reduced', async () => {
    mockReducedMotion(true);
    accountSlot({ left: 300, top: 620, width: 28, height: 28 });
    const onComplete = vi.fn();
    render(<WelcomeBackSplash username="vybe_tester" onComplete={onComplete} />);

    await waitFor(() => expect(root()).toHaveAttribute('data-welcome-motion', 'direct'));
    expect(root()).toHaveAttribute('data-welcome-phase', 'hold');
    expect(document.body).toHaveClass(WELCOME_ACCOUNT_PENDING);
    expect(root().hasAttribute('data-fly-x')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(document.body).not.toHaveClass(WELCOME_ACCOUNT_PENDING);
    expect(document.querySelector('[data-welcome-confetti]')).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('measures a held account avatar even while its picture is hidden', () => {
    document.body.classList.add(WELCOME_ACCOUNT_PENDING);
    const slot = accountSlot({ left: 300, top: 620, width: 28, height: 28 });
    slot.style.opacity = '0';
    expect(readAccountAvatarRect()).toEqual({ left: 300, top: 620, width: 28, height: 28 });

    document.body.classList.remove(WELCOME_ACCOUNT_PENDING);
    expect(readAccountAvatarRect()).toBeNull();
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

  it('keeps only return notices that are not the welcome heading', () => {
    expect(welcomeReturnNotices([
      { title: 'Welcome back! ✨', type: 'success' },
      { title: 'Your new Daily Brief is ready', description: 'Tap the brief on your home screen to read it.', type: 'message' },
      { title: 'Could not save that draft', type: 'error' },
      { title: 'Layout saved', type: 'success' },
    ])).toEqual(['Your new Daily Brief is ready — Tap the brief on your home screen to read it.']);
  });
});
