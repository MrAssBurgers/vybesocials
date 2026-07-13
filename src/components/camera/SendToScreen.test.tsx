import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SendToScreen } from './SendToScreen';
import { emptySelection, addRecipient, type SnapRecipient } from '@/lib/camera/recipientSelection';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual };
});

vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/hooks/useFriends', () => ({ useFriends: () => ({ data: [] }) }));
vi.mock('@/hooks/useMessages', () => ({ useConversations: () => ({ data: [] }) }));
vi.mock('@/hooks/useCloseFriendIds', () => ({ useCloseFriendIds: () => ({ ids: new Set() }) }));
vi.mock('@/hooks/useBlockedUsers', () => ({ useBlockedUserIds: () => [] }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => 'me' }));

const mia: SnapRecipient = {
  id: 'p-mia',
  type: 'friend',
  name: 'Mia',
  username: 'mia',
  conversationId: 'c-mia',
};

describe('SendToScreen', () => {
  const onBack = vi.fn();
  const onConfirm = vi.fn();
  const onSelectionChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates back from the header', () => {
    render(
      <SendToScreen
        selection={emptySelection()}
        onSelectionChange={onSelectionChange}
        allowStories={false}
        onBack={onBack}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('disables send until a destination is selected', () => {
    render(
      <SendToScreen
        selection={emptySelection()}
        onSelectionChange={onSelectionChange}
        allowStories={false}
        onBack={onBack}
        onConfirm={onConfirm}
      />,
    );
    const sendButtons = screen.getAllByRole('button', { name: /Select recipients/i });
    const confirm = sendButtons[sendButtons.length - 1]!;
    expect(confirm.hasAttribute('disabled')).toBe(true);
  });

  it('shows recipient chips with remove actions', () => {
    render(
      <SendToScreen
        selection={addRecipient(emptySelection(), mia)}
        onSelectionChange={onSelectionChange}
        allowStories={false}
        onBack={onBack}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText('Mia')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove Mia'));
    expect(onSelectionChange).toHaveBeenCalled();
  });
});
