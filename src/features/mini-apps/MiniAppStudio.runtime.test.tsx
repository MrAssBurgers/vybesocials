import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniAppStudio } from './MiniAppStudio';
import { MINI_APP_RUNTIME_CHANNEL } from './runtimeMessages';
vi.mock('framer-motion', () => ({ useReducedMotion: () => false }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: true }) }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/lib/sounds', () => ({ playSound: vi.fn() }));
vi.mock('./repository', () => ({ saveMiniAppDraft: vi.fn(), publishMiniApp: vi.fn() }));
vi.mock('./recovery', () => ({ readMiniAppRecoveryEntry: () => null, saveMiniAppRecovery: () => true, clearMiniAppRecovery: vi.fn() }));
afterEach(cleanup);

describe('studio runtime recovery', () => {
  it.each(['HTML', 'JavaScript'])('preserves authored code after runtime failure and returns focus to the active %s editor', language => {
    const scroll = vi.fn();
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    try {
      const { container } = render(<MemoryRouter><MiniAppStudio ownerId="alice" draft={null} onClose={vi.fn()} onSaved={vi.fn()} /></MemoryRouter>);
      fireEvent.mouseDown(screen.getByRole('tab', { name: language, exact: true }), { button: 0, ctrlKey: false });
      const code = language === 'HTML' ? '<main>My unsaved app</main><script>throw new Error("Test failure")</script>' : 'throw new Error("My unsaved JavaScript failure");';
      const editor = screen.getByLabelText(`${language} code`);
      expect(editor.closest('[role="tabpanel"]')).toHaveAttribute('data-state', 'active');
      if (language === 'JavaScript') {
        // Shared Tabs force-mount inactive editors and hide them with CSS.
        const inactivePanel = container.querySelector('[role="tabpanel"][data-state="inactive"]')!;
        expect(inactivePanel.querySelector('textarea')).toBe(screen.getByLabelText('HTML code'));
        expect(inactivePanel).toHaveClass('data-[state=inactive]:hidden');
      }
      fireEvent.change(editor, { target: { value: code } });
      fireEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
      fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
      const frame = container.querySelector('iframe')!;
      const oldWindow = frame.contentWindow;
      fireEvent(window, new MessageEvent('message', { source: oldWindow, data: { channel: MINI_APP_RUNTIME_CHANNEL, runId: '1', kind: 'error', message: 'Test failure' } }));
      expect(screen.getByRole('alert')).toHaveTextContent('Test failure');
      expect(editor).toHaveValue(code);
      fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
      expect(frame.isConnected).toBe(false);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(editor).toHaveFocus();
      expect(editor).toHaveValue(code);
      expect(scroll).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' });
      fireEvent(window, new MessageEvent('message', { source: oldWindow, data: { channel: MINI_APP_RUNTIME_CHANNEL, runId: '1', kind: 'error', message: 'Late failure' } }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
      expect(container.querySelector('iframe')).toBeNull();
      expect(screen.getByRole('button', { name: 'Run app' })).toBeEnabled();
    } finally {
      if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous);
      else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
