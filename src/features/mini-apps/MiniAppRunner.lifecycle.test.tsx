import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniAppRunner } from './MiniAppRunner';
import { MINI_APP_TEMPLATES } from './templates';

const motion = vi.hoisted(() => ({ app: false, system: false }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => motion.system }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: motion.app }) }));

let visibility: DocumentVisibilityState;
beforeEach(() => {
  visibility = 'visible';
  motion.app = false; motion.system = false;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function changeVisibility(next: DocumentVisibilityState) {
  visibility = next;
  fireEvent(document, new Event('visibilitychange'));
}

describe('mini app runtime lifecycle', () => {
  const source = MINI_APP_TEMPLATES[0].source;

  it('destroys the iframe during the hidden event and never automatically resumes', () => {
    const { container } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const previous = container.querySelector('iframe')!;
    let presentDuringEvent: boolean | undefined;
    const observeAfterRunner = () => { presentDuringEvent = Boolean(container.querySelector('iframe')); };
    document.addEventListener('visibilitychange', observeAfterRunner);
    try {
      changeVisibility('hidden');
      // Assert within the lifecycle event, before the browser could freeze it.
      expect(presentDuringEvent).toBe(false);
      expect(previous.isConnected).toBe(false);
      expect(screen.getByRole('status')).toHaveTextContent('App stopped in the background');
      changeVisibility('visible');
      expect(container.querySelector('iframe')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
      expect(container.querySelector('iframe')).not.toBe(previous);
      const next = new DOMParser().parseFromString(container.querySelector('iframe')!.srcdoc, 'text/html');
      expect(next.querySelector('iframe')?.getAttribute('srcdoc')).toContain(source.html);
      expect(container.querySelector('iframe')?.srcdoc).not.toBe(previous.srcdoc); // Fresh diagnostic run identity.
    } finally { document.removeEventListener('visibilitychange', observeAfterRunner); }
  });

  it('tears down before pagehide and requires a new Run after a cached page returns', () => {
    const { container } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    let presentDuringEvent: boolean | undefined;
    const observeAfterRunner = () => { presentDuringEvent = Boolean(container.querySelector('iframe')); };
    window.addEventListener('pagehide', observeAfterRunner);
    try {
      const event = new Event('pagehide');
      Object.defineProperty(event, 'persisted', { value: true });
      fireEvent(window, event);
      expect(presentDuringEvent).toBe(false);
      fireEvent(window, new Event('pageshow'));
      expect(container.querySelector('iframe')).toBeNull();
      expect(screen.getByRole('button', { name: 'Run again' })).toBeEnabled();
    } finally { window.removeEventListener('pagehide', observeAfterRunner); }
  });

  it('refuses to mount authored code if Run is invoked while already hidden', () => {
    visibility = 'hidden';
    const { container } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeEnabled();
    changeVisibility('visible');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('preserves source and phone width across repeated background restarts', () => {
    const { container, rerender } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Phone', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    for (let round = 0; round < 2; round++) {
      changeVisibility('hidden');
      expect(container.querySelector('iframe')).toBeNull();
      const edited = { ...source, html: `<main>Retained source ${round}</main>` };
      rerender(<MiniAppRunner source={edited} />);
      changeVisibility('visible');
      fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
      expect(container.querySelector('iframe')?.srcdoc).toContain(`Retained source ${round}`);
      expect(container.querySelector('iframe')?.parentElement).toHaveStyle({ width: '320px' });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Fit', exact: true }));
    expect(container.querySelector('iframe')?.parentElement).toHaveStyle({ width: '100%' });
  });

  it('does not interrupt an active runtime for a visible-state notification', () => {
    const { container } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const frame = container.querySelector('iframe');
    changeVisibility('visible');
    expect(container.querySelector('iframe')).toBe(frame);
    expect(screen.queryByText('App stopped in the background')).not.toBeInTheDocument();
  });

  it.each(['app', 'system'] as const)('honors initial %s reduced motion without an extra restart', preference => {
    motion[preference] = true;
    const { container } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    expect(container.querySelector('iframe')?.srcdoc).toContain('document.head.appendChild(motion)');
    expect(screen.getByRole('button', { name: 'Restart' })).toBeEnabled();
    expect(screen.queryByText('App stopped after motion settings changed')).not.toBeInTheDocument();
  });

  it.each([false, true])('stops explicitly when reduced motion changes from %s without silently reloading source', initial => {
    motion.app = initial;
    const authored = { ...source, html: '<main>Keep authored content</main>' };
    const { container, rerender } = render(<MiniAppRunner source={authored} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const frame = container.querySelector('iframe')!;
    const previousDocument = frame.srcdoc;
    motion.app = !initial;
    rerender(<MiniAppRunner source={authored} />);
    expect(frame.isConnected).toBe(false);
    expect(frame.srcdoc).toBe(previousDocument);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('App stopped after motion settings changed');
    expect(authored.html).toBe('<main>Keep authored content</main>');
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    const nextDocument = container.querySelector('iframe')!.srcdoc;
    expect(nextDocument).toContain('Keep authored content');
    if (initial) expect(nextDocument).not.toContain('document.head.appendChild(motion)');
    else expect(nextDocument).toContain('document.head.appendChild(motion)');
  });

  it('keeps running when a preference toggles but effective reduced motion is unchanged', () => {
    motion.system = true;
    const { container, rerender } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const frame = container.querySelector('iframe');
    motion.app = true;
    rerender(<MiniAppRunner source={source} />);
    expect(container.querySelector('iframe')).toBe(frame);
  });

  it('removes lifecycle subscriptions and the runtime on unmount', () => {
    const addDocument = vi.spyOn(document, 'addEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const addWindow = vi.spyOn(window, 'addEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const { container, unmount } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const frame = container.querySelector('iframe')!;
    const visibilityListener = addDocument.mock.calls.find(([event]) => event === 'visibilitychange')?.[1];
    const pagehideListener = addWindow.mock.calls.find(([event]) => event === 'pagehide')?.[1];
    expect(visibilityListener).toBeTypeOf('function');
    expect(pagehideListener).toBeTypeOf('function');
    unmount();
    expect(frame.isConnected).toBe(false);
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', visibilityListener);
    expect(removeWindow).toHaveBeenCalledWith('pagehide', pagehideListener);
  });
});
