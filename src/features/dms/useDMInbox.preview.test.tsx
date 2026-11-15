import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, fetching: false, error: null as Error | null, hidden: new Set<string>(), rows: [] as LoadedDMConversation[], empty: [], set: new Set(), map: new Map(), noop: () => {} }));
vi.mock('react-router-dom', () => ({ useParams: () => ({}) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: state.uid + '-profile', user_id: state.uid }, authReady: true }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => state.uid + '-profile' }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/hooks/useDMConversations', () => ({ useDMConversations: () => ({ pinnedConversations: state.empty, unpinnedConversations: state.rows, isLoading: false, isFetching: state.fetching, isFetched: true, error: state.error, refetch: state.noop }) }));
vi.mock('@/hooks/useConversationTyping', () => ({ useConversationTyping: () => ({ isTyping: () => false }) }));
vi.mock('@/hooks/useConversationListPresence', () => ({ useConversationListPresence: () => state.map }));
vi.mock('@/hooks/useInboxCallSummaries', () => ({ useInboxCallSummaries: () => ({ data: state.map }) }));
vi.mock('@/hooks/useQuickAddSuggestions', () => ({ useQuickAddSuggestions: () => ({ suggestions: state.empty }) }));
vi.mock('@/hooks/useLockedChats', () => ({ useLockedChatIds: () => ({ data: state.set }) }));
vi.mock('@/hooks/useHiddenConversations', () => ({ useHiddenConversations: () => ({ data: state.hidden }) }));
vi.mock('@/hooks/useTrashedConversations', () => ({ useTrashedConversationIds: () => ({ data: state.set }) }));
vi.mock('@/hooks/useMessageRequests', () => ({ useMessageRequests: () => ({ data: state.empty, isLoading: false }), usePendingRequestCount: () => ({ data: 0 }) }));
vi.mock('@/hooks/useRecentNewFriendProfileIds', () => ({ useRecentNewFriendProfileIds: () => ({ data: state.set }) }));
vi.mock('@/hooks/useCloseFriendIds', () => ({ useCloseFriendIds: () => ({ ids: state.set, isLoading: false, isFetched: true }) }));
vi.mock('@/hooks/useStreaks', () => ({ useStreakMap: () => state.map }));
vi.mock('@/hooks/useStories', () => ({ useStories: () => ({ data: state.empty }) }));
vi.mock('@/hooks/useNearbyFriendLink', () => ({ useNearbyFriendLink: () => ({ peers: state.empty, status: 'idle', retry: state.noop }) }));
vi.mock('./useDmInboxProjection', () => ({ useDmInboxProjection: () => ({ entries: state.empty, enabled: false, projectionReady: true, isLoading: false }) }));
vi.mock('./inbox/useInboxCategories', () => ({ useInboxCategories: () => ({ activeCategory: 'all', setActiveCategory: state.noop, registerChipRef: state.noop }) }));
vi.mock('@/lib/dmInboxFeatureFlags', () => ({ isDmInboxCategoryBarEnabled: () => false, isDmInboxProjectionReadEnabled: () => false, isRelationshipEmojiUiEnabled: () => false, isRelationshipProjectionReadEnabled: () => false }));
vi.mock('@/hooks/useRelationshipEmojiPreferences', () => ({ useRelationshipEmojiPreferences: () => ({ data: undefined }) }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ resolveSessionProfileId: state.noop }));
vi.mock('@/lib/profileAvatarCache', () => ({ resolveProfileAvatarUrl: () => undefined }));
vi.mock('@/lib/signedUrlCache', () => ({ batchSignUrls: vi.fn().mockResolvedValue(new Map()) }));
import { useDMInbox } from './useDMInbox';

const base = { id: 'chat', member_ids: ['alice-profile', 'bob-profile'], is_group: false, unread_count: 0,
  created_at: '2026-11-14T12:00:00Z', updated_at: '2026-11-14T12:00:00Z',
  last_message: { id: 'last', sender_id: 'bob-profile', content: 'Original message', created_at: '2026-11-14T12:00:00Z', message_type: 'text' },
  members: [{ conversation_id: 'chat', user_id: 'alice-profile', is_pinned: false, is_muted: false },
    { conversation_id: 'chat', user_id: 'bob-profile', profile: { id: 'bob-profile', username: 'bob', display_name: 'Bob' } }],
} as LoadedDMConversation;
beforeEach(() => { sessionStorage.clear(); state.uid = 'alice'; state.epoch = 1; state.fetching = false; state.error = null; state.hidden = new Set(); state.rows = [base]; });
afterEach(cleanup);
const preview = (value: ReturnType<typeof useDMInbox>) => {
  const row = value.displayRows.find(row => row.type === 'conversation');
  if (!row || row.type !== 'conversation') throw new Error('No conversation row');
  return row.preview;
};
describe('derived inbox previews after existing conversation changes', () => {
  it('does not resurrect a known archived chat while the list refetches', () => {
    const hook = renderHook(useDMInbox);
    expect(hook.result.current.displayRows).toHaveLength(1);
    state.hidden = new Set(['chat']); state.fetching = true; hook.rerender();
    expect(hook.result.current.allConversations).toEqual([]);
    expect(hook.result.current.displayRows).toEqual([]);
  });
  it('clears a confirmed empty inbox after the last conversation is archived', () => {
    const hook = renderHook(useDMInbox);
    expect(hook.result.current.displayRows).toHaveLength(1);
    state.rows = []; hook.rerender();
    expect(hook.result.current.allConversations).toEqual([]);
    expect(hook.result.current.displayRows).toEqual([]);
  });
  it.each(['different account', 'same account incarnation'])('does not retain the previous inbox for a %s', mode => {
    const hook = renderHook(useDMInbox);
    expect(hook.result.current.displayRows).toHaveLength(1);
    state.rows = []; state.fetching = true; state.epoch++;
    if (mode === 'different account') state.uid = 'charlie';
    hook.rerender();
    expect(hook.result.current.allConversations).toEqual([]);
    expect(hook.result.current.displayRows).toEqual([]);
  });
  it('retains the current account inbox during a failed background refresh', () => {
    const hook = renderHook(useDMInbox);
    state.rows = []; state.error = new Error('Offline'); hook.rerender();
    expect(hook.result.current.displayRows).toHaveLength(1);
  });
  it('reflects pin and mute changes without requiring a new message timestamp', async () => {
    const hook = renderHook(useDMInbox);
    expect(preview(hook.result.current)).toMatchObject({ isPinned: false, isMuted: false });
    state.rows = [{ ...base, members: base.members!.map(member => member.user_id === 'alice-profile' ? { ...member, is_pinned: true, is_muted: true } : member) }];
    hook.rerender();
    await waitFor(() => expect(preview(hook.result.current)).toMatchObject({ isPinned: true, isMuted: true }));
  });
  it('shows edited message text when the message ID and creation time stay the same', async () => {
    const hook = renderHook(useDMInbox);
    expect(preview(hook.result.current).previewText).toContain('Original message');
    state.rows = [{ ...base, last_message: { ...base.last_message!, content: 'Edited message' } }];
    hook.rerender();
    await waitFor(() => expect(preview(hook.result.current).previewText).toContain('Edited message'));
  });
  it('refreshes a peer profile without requiring a new chat message', async () => {
    const hook = renderHook(useDMInbox);
    expect(preview(hook.result.current).displayName).toBe('Bob');
    state.rows = [{ ...base, members: base.members!.map(member => member.profile
      ? { ...member, profile: { ...member.profile, display_name: 'Updated Bob' } } : member) }];
    hook.rerender();
    await waitFor(() => expect(preview(hook.result.current).displayName).toBe('Updated Bob'));
  });
});
