import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  uid: 'alice', epoch: 1, crashNotes: false,
  own: null as any, friends: null as any, navigate: vi.fn(), report: vi.fn(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mock.navigate }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, profile: { id: `${mock.uid}-profile`, user_id: mock.uid, username: mock.uid } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: mock.uid, epoch: mock.epoch }) }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountSnapshot: () => ({ uid: mock.uid, epoch: mock.epoch }), tokenAccountGuard: () => () => {} }));
vi.mock('@/hooks/useNotes', () => ({
  useMyNote: () => { if (mock.crashNotes) throw new Error('Note subtree failed'); return mock.own; },
  useFriendsNotes: () => mock.friends,
  useSetNote: () => ({ mutate: vi.fn(), isPending: false }), useDeleteNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: vi.fn() }, rpc: vi.fn() } }));
vi.mock('@/lib/bugReportClient', () => ({ reportAppCrash: mock.report }));
vi.mock('@/hooks/useChatPrefetch', () => ({ useChatPrefetch: () => ({ warmConversation: vi.fn() }) }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ resolveSessionProfileId: vi.fn() }));
vi.mock('@/lib/leaveDmConversation', () => ({ isDmLeaveSuppressActive: () => false }));
vi.mock('./DMHeader', () => ({ DMHeader: () => <h1>Messages</h1> }));
vi.mock('./DMCategoryTabs', () => ({ DMCategoryTabs: () => <button id="dm-inbox-tab-all">All chats</button> }));
vi.mock('./inbox/InboxCategoryBar', () => ({ InboxCategoryBar: () => null }));
vi.mock('./DMComposeButton', () => ({ DMComposeButton: () => null }));
vi.mock('@/hooks/useHeldConversationOptions', () => ({ useHeldConversationOptions: () => ({ held: { isOpen: false }, openConversationOptions: vi.fn(), setOptionsOpen: vi.fn() }) }));
vi.mock('@/components/chat/dm-inbox/HeldConversationOptionsSheet', () => ({ HeldConversationOptionsSheet: () => null }));
vi.mock('@/components/chat/dm-inbox/SwipeableDmConversationRow', () => ({ SwipeableDmConversationRow: ({ onClick }: { onClick: () => void }) => <button onClick={onClick}>Open existing chat</button> }));
vi.mock('@/lib/dmInboxRowOverlay', () => ({ applyDmInboxRowLiveOverlay: (preview: unknown) => preview }));
vi.mock('@/components/stories/StoryViewer', () => ({ StoryViewer: () => null }));
vi.mock('./useDMInbox', () => ({ useDMInbox: () => {
  const rows = [{ type: 'conversation', preview: { conversationId: 'existing-chat', conversation: {} } }];
  return { rows, displayRows: rows, user: { id: mock.uid }, profileId: `${mock.uid}-profile`, unreadBadgeCount: 0,
    categoryBarEnabled: false, awaitingProfileId: false, activeTab: 'all', searchQuery: '', storyGroups: [], refetch: vi.fn() };
} }));
import { DMInboxPage } from './DMInboxPage';
import { DmInboxSafeList } from '@/components/chat/dm-inbox/DmInboxSafeList';
const expectedRenderError = (event: ErrorEvent) => { if (event.error?.message === 'Note subtree failed') event.preventDefault(); };

beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'alice'; mock.epoch++; mock.crashNotes = false;
  mock.own = { data: null, state: { revision: null }, refetch: vi.fn(), isError: false, isPending: false };
  mock.friends = { data: [], refetch: vi.fn(), isError: false };
  window.addEventListener('error', expectedRenderError);
  vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); window.removeEventListener('error', expectedRenderError); vi.restoreAllMocks(); });

describe.each([['modern inbox', DMInboxPage], ['fallback inbox', DmInboxSafeList]] as const)('%s Notes integration', (_name, Inbox) => {
  it('mounts the ready note editor before chats inside their existing scroll panel', async () => {
    render(<Inbox />);
    const list = screen.getByRole('tabpanel');
    const notes = within(list).getByRole('region', { name: 'Notes' });
    const chat = within(list).getByRole('button', { name: 'Open existing chat' });
    expect(notes.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const add = within(notes).getByRole('button', { name: 'Add a note' });
    add.focus(); fireEvent.click(add);
    expect(screen.getByRole('dialog', { name: 'Set a Note' })).toHaveAccessibleDescription('Share a short update with friends. Notes disappear after 24 hours.');
    const editor = screen.getByRole('textbox', { name: 'Your note' });
    fireEvent.change(editor, { target: { value: 'Unsent local draft' } });
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); await waitFor(() => expect(add).toHaveFocus());
    fireEvent.click(chat); expect(mock.navigate).toHaveBeenCalledWith('/messages/existing-chat');
  });

  it('contains a Notes render crash and retries it without replacing the conversation list', () => {
    mock.crashNotes = true; render(<Inbox />);
    expect(screen.getByRole('alert')).toHaveTextContent('Notes could not open. Your chats are still available.');
    fireEvent.click(screen.getByRole('button', { name: 'Open existing chat' }));
    expect(mock.navigate).toHaveBeenCalledWith('/messages/existing-chat');
    mock.crashNotes = false; fireEvent.click(screen.getByRole('button', { name: 'Retry notes' }));
    expect(screen.getByRole('button', { name: 'Add a note' })).toBeEnabled();
    expect(screen.queryByText('Notes could not open.')).not.toBeInTheDocument();
  });

  it('keeps a failed Notes read retryable while the chat list remains usable', () => {
    mock.own.state = undefined; mock.own.isError = true;
    render(<Inbox />);
    expect(screen.getByRole('button', { name: 'Your note is unavailable' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry notes' }));
    expect(mock.own.refetch).toHaveBeenCalledTimes(1); expect(mock.friends.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Open existing chat' })).toBeEnabled();
  });

  it('clears an open unsent note on account and same-account session changes', () => {
    const view = render(<Inbox />);
    for (const nextUid of ['bob', 'bob']) {
      fireEvent.click(screen.getByRole('button', { name: 'Add a note' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Your note' }), { target: { value: 'Private unsent draft' } });
      mock.uid = nextUid; mock.epoch++; view.rerender(<Inbox />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add a note' }));
      expect(screen.getByRole('textbox', { name: 'Your note' })).toHaveValue('');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    }
  });
});
