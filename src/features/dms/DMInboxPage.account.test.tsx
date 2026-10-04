import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, snippet: 'Alice private cached preview' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/hooks/useChatPrefetch', () => ({ useChatPrefetch: () => ({ warmConversation: vi.fn() }) }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ resolveSessionProfileId: vi.fn() }));
vi.mock('@/lib/leaveDmConversation', () => ({ isDmLeaveSuppressActive: () => false }));
vi.mock('./DMHeader', () => ({ DMHeader: () => null }));
vi.mock('./DMCategoryTabs', () => ({ DMCategoryTabs: () => null }));
vi.mock('./inbox/InboxCategoryBar', () => ({ InboxCategoryBar: () => null }));
vi.mock('./DMConversationList', () => ({ DMConversationList: ({ displayRows }: { displayRows: string[] }) => <div>{displayRows.join(',')}</div> }));
vi.mock('./useDMInbox', async () => {
  const { useState } = await import('react');
  return { useDMInbox: () => {
    // Models the real inbox's lastStableRows/lastNonEmpty preview retention.
    const [displayRows] = useState([state.snippet]);
    return { displayRows, rows: displayRows, user: { id: state.uid }, unreadBadgeCount: 0, categoryBarEnabled: false, awaitingProfileId: false };
  } };
});
import { DMInboxPage } from './DMInboxPage';
afterEach(cleanup);

describe('mounted inbox account lifetime', () => {
  it('does not retain private derived rows after an account change or return to an older account', () => {
    state.uid = 'alice'; state.epoch = 1; state.snippet = 'Alice private cached preview';
    const view = render(<DMInboxPage />);
    expect(screen.getByText('Alice private cached preview')).toBeInTheDocument();
    state.uid = 'moderator'; state.epoch = 2; state.snippet = 'No moderator chats';
    view.rerender(<DMInboxPage />);
    expect(screen.queryByText('Alice private cached preview')).not.toBeInTheDocument();
    expect(screen.getByText('No moderator chats')).toBeInTheDocument();
    state.uid = 'alice'; state.epoch = 3; state.snippet = 'Alice current server data';
    view.rerender(<DMInboxPage />);
    expect(screen.queryByText('Alice private cached preview')).not.toBeInTheDocument();
    expect(screen.getByText('Alice current server data')).toBeInTheDocument();
  });
});
