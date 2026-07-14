import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clearStaleViewportOverlays } from './clearStaleViewportOverlays';

describe('clearStaleViewportOverlays', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute('data-camera-open');
    document.documentElement.removeAttribute('data-chat-shield');
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('forces the chat shield curtain to pointer-events none', () => {
    const curtain = document.createElement('div');
    curtain.id = 'vybe-chat-shield-curtain';
    curtain.style.pointerEvents = 'auto';
    curtain.style.display = 'block';
    document.body.appendChild(curtain);
    clearStaleViewportOverlays();
    expect(curtain.style.pointerEvents).toBe('none');
    expect(curtain.style.display).toBe('none');
  });

  it('disables pointer events on hidden fullscreen body children', () => {
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0px',
      pointerEvents: 'auto',
      opacity: '0',
    });
    // jsdom may not report getComputedStyle inset; force covering size.
    Object.defineProperty(overlay, 'offsetWidth', { value: window.innerWidth });
    Object.defineProperty(overlay, 'offsetHeight', { value: window.innerHeight });
    document.body.appendChild(overlay);
    clearStaleViewportOverlays();
    expect(overlay.style.pointerEvents).toBe('none');
  });
});
