import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useChatPrefetch } from '@/hooks/useChatPrefetch';
import { resolveSessionProfileId } from '@/lib/resolveSessionProfileId';
import { Button } from '@/components/ui/button';
import { DMHeader } from './DMHeader';
import { DMCategoryTabs } from './DMCategoryTabs';
import { InboxCategoryBar } from './inbox/InboxCategoryBar';
import { DMConversationList } from './DMConversationList';
import { useDMInbox } from './useDMInbox';
import { writeFilterScroll } from '@/lib/dmInboxFilterPersistence';
import { isDmLeaveSuppressActive } from '@/lib/leaveDmConversation';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { InboxNotes } from './InboxNotes';

export function DMInboxPage() {
  const { user } = useAuth();
  const session = useReportAccountSession();
  return <DMInboxContent key={JSON.stringify([user?.id, session.epoch])} />;
}

function DMInboxContent() {
  const navigate = useNavigate();
  const { warmConversation } = useChatPrefetch();
  const inbox = useDMInbox();

  const warm = useCallback(
    (conversationId: string, conversationHint?: LoadedDMConversation | null) =>
      warmConversation(conversationId, 'high', conversationHint),
    [warmConversation],
  );

  const openChat = useCallback(
    (conversationId: string, conversationHint?: LoadedDMConversation | null) => {
      // Ghost-reopen guard: leave tap can land on a remounted inbox row.
      if (isDmLeaveSuppressActive()) return;
      if (conversationId === inbox.activeConversationId) return;
      const scrollKey = inbox.categoryBarEnabled
        ? (inbox.activeCategory ?? 'all')
        : inbox.activeTab || 'all';
      const listEl = document.getElementById('dm-inbox-list');
      if (listEl) {
        writeFilterScroll(scrollKey, listEl.scrollTop);
      }
      // Sync navigate — startTransition delayed ChatView mount by a full frame+.
      warm(conversationId, conversationHint);
      try {
        sessionStorage.setItem('vybe-dm-from-inbox', conversationId);
      } catch {
        /* ignore */
      }
      void navigate(`/messages/${conversationId}`);
      void resolveSessionProfileId(inbox.profileId);
    },
    [
      inbox.activeConversationId,
      inbox.activeCategory,
      inbox.activeTab,
      inbox.categoryBarEnabled,
      inbox.profileId,
      navigate,
      warm,
    ],
  );

  return (
    <section className="dm-inbox" aria-label="Direct messages">
      <span className="sr-only" role="status" aria-live="polite">
        {inbox.unreadBadgeCount > 0
          ? `${inbox.unreadBadgeCount} unread ${inbox.unreadBadgeCount === 1 ? 'message' : 'messages'}`
          : 'No unread messages'}
      </span>
      <div className="dm-inbox-column">
        <DMHeader
          totalUnreadCount={inbox.unreadBadgeCount}
          pendingRequestCount={inbox.pendingRequestCount}
          onSearch={() => navigate('/messages/search')}
        />
        {/*
          Never block the inbox while Firebase auth uid exists — the list query
          already loads with authUid until legacy profileId resolves. iOS WKWebView
          often resolves profile slower than Android; a full-screen "Signing in…"
          looked like DMs were broken.
        */}
        {inbox.awaitingProfileId &&
        !inbox.hasCachedRows &&
        inbox.displayRows.length === 0 &&
        inbox.profileResolveTimedOut ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Still signing you in to Messages…
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={inbox.retryProfileResolve}
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : (
          <>
        {inbox.categoryBarEnabled ? (
          <InboxCategoryBar
            activeCategory={inbox.activeCategory}
            counts={inbox.categoryBadges}
            onChange={inbox.setActiveCategory}
            registerChipRef={inbox.registerCategoryChipRef}
          />
        ) : (
          <DMCategoryTabs
            active={inbox.activeTab}
            onChange={inbox.setActiveTab}
            redesignEnabled={inbox.redesignEnabled}
            badges={{
              unread: inbox.unreadBadgeCount,
              requests: inbox.pendingRequestCount,
              needsReply: inbox.needsReplyCount,
              bestFriends: inbox.bestFriendCount,
              nearby: inbox.nearbyCount,
            }}
          />
        )}
        <DMConversationList
          header={<InboxNotes />}
          rows={inbox.rows}
          displayRows={inbox.displayRows}
          profileId={inbox.profileId}
          authUid={inbox.user?.id}
          activeConversationId={inbox.activeConversationId}
          activeTab={inbox.activeTab}
          activeCategory={inbox.activeCategory}
          categoryMatchCount={inbox.categoryMatchCount}
          categoryBarEnabled={inbox.categoryBarEnabled}
          pendingRequests={inbox.pendingRequests}
          isConversationTyping={inbox.isConversationTyping}
          conversationPresenceMap={inbox.conversationPresenceMap}
          showSkeleton={inbox.showSkeleton}
          showEmpty={inbox.showEmpty}
          isFetching={inbox.isFetching}
          searchQuery={inbox.searchQuery}
          hasError={Boolean(inbox.error && inbox.isFetched)}
          nearbyStatus={inbox.nearbyStatus}
          storyGroups={inbox.storyGroups}
          onOpen={openChat}
          onWarm={warm}
          onRetry={() => void inbox.refetch()}
          onCompose={() => navigate('/messages/new')}
          onOpenNearbyPeer={(peerUserId) => {
            void (async () => {
              try {
                const { db } = await import('@/lib/firebase');
                const { data: convId, error } = await db.rpc('create_dm_conversation', {
                  other_profile_id: peerUserId,
                });
                if (error) throw error;
                if (convId) await openChat(String(convId));
              } catch (error) {
                console.error(error);
              }
            })();
          }}
          onNearbyRetry={inbox.nearbyRetry}
        />
          </>
        )}
      </div>
    </section>
  );
}
