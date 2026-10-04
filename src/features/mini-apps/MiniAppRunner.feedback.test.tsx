import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniAppRunner } from './MiniAppRunner';
import { MINI_APP_TEMPLATES } from './templates';
import { MINI_APP_ERROR_LENGTH, MINI_APP_MAX_ERRORS, MINI_APP_RUNTIME_CHANNEL, MINI_APP_START_TIMEOUT_MS } from './runtimeMessages';
vi.mock('framer-motion', () => ({ useReducedMotion: () => false }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: false }) }));
const source = MINI_APP_TEMPLATES[0].source;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function message(sender: Window | null, kind: string, message?: unknown, runId = '1') {
  fireEvent(window, new MessageEvent('message', { source: sender, data: { channel: MINI_APP_RUNTIME_CHANNEL, runId, kind, message } }));
}

describe('mini app startup and feedback lifecycle', () => {
  it('requires current-frame readiness and cancels the startup deadline after acknowledgement', () => {
    const { container } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const frame = container.querySelector('iframe')!;
    expect(screen.getByRole('status')).toHaveTextContent('Starting preview');
    message(window, 'ready'); message(frame.contentWindow, 'ready', undefined, 'old');
    expect(screen.getByRole('status')).toHaveTextContent('Starting preview');
    message(frame.contentWindow, 'ready');
    expect(screen.getByRole('status')).toHaveTextContent('Preview started');
    act(() => vi.advanceTimersByTime(MINI_APP_START_TIMEOUT_MS * 2));
    expect(container.querySelector('iframe')).toBe(frame);
  });

  it('closes an unconfirmed startup, retains code and width, then waits for explicit retry', () => {
    const { container } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Phone', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const frame = container.querySelector('iframe')!;
    const oldWindow = frame.contentWindow;
    act(() => vi.advanceTimersByTime(MINI_APP_START_TIMEOUT_MS));
    expect(frame.isConnected).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('App did not finish starting');
    message(oldWindow, 'ready');
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(container.querySelector('iframe')?.parentElement).toHaveStyle({ width: '320px' });
    expect(container.querySelector('iframe')?.srcdoc).toContain(source.title);
    message(container.querySelector('iframe')!.contentWindow, 'ready', undefined, '2');
    expect(screen.getByRole('status')).toHaveTextContent('Preview started');
  });

  it('renders bounded diagnostic text inertly and keeps Stop available during an error stream', () => {
    const { container } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const sender = container.querySelector('iframe')!.contentWindow;
    for (let i = 0; i < 50; i++) message(sender, 'error', `<img src=x onerror=alert(1)>${'x'.repeat(1000)}`);
    message(sender, 'ready');
    const feedback = screen.getByRole('alert');
    expect(within(feedback).getAllByRole('listitem')).toHaveLength(MINI_APP_MAX_ERRORS);
    expect(within(feedback).getAllByRole('listitem')[0].textContent).toHaveLength(MINI_APP_ERROR_LENGTH);
    expect(feedback.querySelector('img')).toBeNull();
    expect(feedback).toHaveTextContent('Further errors are hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('App stopped');
    act(() => vi.advanceTimersByTime(MINI_APP_START_TIMEOUT_MS));
    expect(screen.getByRole('status')).not.toHaveTextContent('did not finish');
  });

  it('clears old feedback on explicit Run latest and ignores messages from the replaced frame', () => {
    const { container, rerender } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const previous = container.querySelector('iframe')!.contentWindow;
    message(previous, 'error', 'Old syntax error');
    rerender(<MiniAppRunner source={{ ...source, html: '<main>Corrected code</main>' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Old syntax error');
    fireEvent.click(screen.getByRole('button', { name: 'Run latest' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    message(previous, 'error', 'Stale failure', '2');
    message(previous, 'ready', undefined, '2');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Starting preview');
    expect(container.querySelector('iframe')!.srcdoc).toContain('Corrected code');
  });

  it('cleans startup timers and diagnostic subscriptions on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener'); const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<MiniAppRunner source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const listener = add.mock.calls.find(([event]) => event === 'message')?.[1];
    unmount();
    expect(remove).toHaveBeenCalledWith('message', listener);
    expect(vi.getTimerCount()).toBe(0);
    add.mockRestore(); remove.mockRestore();
  });
});
