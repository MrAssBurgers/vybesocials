import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SnapEditor } from './SnapEditor';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/lib/camera/editorExtensions', () => ({ getSnapEditorExtensions: () => [] }));

const baseProps = {
  mediaUrl: 'blob:http://localhost/test',
  mediaType: 'photo' as const,
  filter: 'normal',
  destination: 'direct' as const,
  chipLabel: 'Send to Mia',
  viewMode: 'view_once' as const,
  onViewModeChange: vi.fn(),
  onRetake: vi.fn(),
  onEditRecipients: vi.fn(),
  onClearRecipients: vi.fn(),
  onSend: vi.fn(),
  onSaveToDevice: vi.fn(),
};

describe('SnapEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows recipient chip and clears recipients', () => {
    render(<SnapEditor {...baseProps} />);
    expect(screen.getByText('Send to Mia')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove recipients'));
    expect(baseProps.onClearRecipients).toHaveBeenCalled();
  });

  it('sends directly when a destination is preselected', () => {
    render(<SnapEditor {...baseProps} animateOnSend={false} />);
    const sendButtons = screen.getAllByLabelText('Send to Mia');
    fireEvent.click(sendButtons[sendButtons.length - 1]!);
    expect(baseProps.onSend).toHaveBeenCalled();
  });

  it('opens recipient editor from chip', () => {
    render(<SnapEditor {...baseProps} />);
    fireEvent.click(screen.getAllByText('Send to Mia')[0]!);
    expect(baseProps.onEditRecipients).toHaveBeenCalled();
  });
});
