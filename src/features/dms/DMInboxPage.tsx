import { startTransition, useCallback } from 'react';
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
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

export function DMInboxPage() {
  const navigate = useNavigate();
  const { warmConversation } = useChatPrefetch();
  const inbox = useDMInbox();

  const warm = useCallback(
    (conversationId: string, conversationHint?: LoadedDMConversation | null) =>
      warmConversation(conversationId, 'high', conversationHint),
    [warmConversation],
  );

  const openChat = useCallback(
    async (conversationId: string, conversationHint?: LoadedDMConversation | null) => {
      if (conversationId === inbox.activeConversationId) return;
      const scrollKey = inbox.categoryBarEnabled
        ? (inbox.activeCategory ?? 'all')
        : inbox.activeTab || 'all';
      const listEl = document.getElementById('dm-inbox-list');
      if (listEl) {
        writeFilterScroll(scrollKey, listEl.scrollTop);
      }
      await resolveSessionProfileId(inbox.profileId);
      warm(conversationId, conversationHint);
      startTransition(() => {
        void navigate(`/messages/${conversationId}`);
      });
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
        {inbox.awaitingProfileId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {inbox.profileResolveTimedOut
                ? 'Still signing you in to Messages…'
                : 'Signing in…'}
            </p>
            {inbox.profileResolveTimedOut && (
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
            )}
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
