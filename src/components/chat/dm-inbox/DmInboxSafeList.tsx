/**
 * Fallback if the primary inbox tree errors.
 * Reuses the same filtered inbox hook so tabs still work.
 */
import { startTransition, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatSearchSheet } from '@/components/chat/ChatSearchSheet';
import { DMHeader } from '@/features/dms/DMHeader';
import { DMCategoryTabs } from '@/features/dms/DMCategoryTabs';
import { DMConversationList } from '@/features/dms/DMConversationList';
import { useDMInbox } from '@/features/dms/useDMInbox';
import { db } from '@/lib/firebase';

export function DmInboxSafeList() {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const inbox = useDMInbox();

  const openChat = useCallback(
    (conversationId: string) => {
      startTransition(() => {
        void navigate(`/messages/${conversationId}`);
      });
    },
    [navigate],
  );

  const openNearbyPeer = useCallback(
    (peerUserId: string) => {
      void (async () => {
        try {
          const { data: convId, error } = await db.rpc('create_dm_conversation', {
            other_profile_id: peerUserId,
          });
          if (error) throw error;
          if (convId) openChat(String(convId));
        } catch (error) {
          console.error(error);
        }
      })();
    },
    [openChat],
  );

  return (
    <section className="dm-inbox" aria-label="Direct messages">
      <div className="dm-inbox-column">
        <DMHeader
          totalUnreadCount={inbox.unreadBadgeCount}
          onSearch={() => setSearchOpen(true)}
        />
        <DMCategoryTabs
          active={inbox.activeTab}
          onChange={inbox.setActiveTab}
          badges={{
            unread: inbox.unreadBadgeCount,
            requests: inbox.pendingRequestCount,
            bestFriends: inbox.bestFriendCount,
            nearby: inbox.nearbyCount,
          }}
        />
        <DMConversationList
          rows={inbox.rows}
          profileId={inbox.profileId}
          authUid={inbox.user?.id}
          activeConversationId={inbox.activeConversationId}
          activeTab={inbox.activeTab}
          showSkeleton={inbox.showSkeleton}
          searchQuery={inbox.searchQuery}
          hasError={Boolean(inbox.error && inbox.isFetched)}
          nearbyStatus={inbox.nearbyStatus}
          onOpen={openChat}
          onQuickReply={(id) => {
            startTransition(() => {
              void navigate(`/messages/${id}?compose=1`);
            });
          }}
          onWarm={() => undefined}
          onRetry={() => void inbox.refetch()}
          onCompose={() => navigate('/messages/new')}
          onOpenNearbyPeer={openNearbyPeer}
          onNearbyRetry={inbox.nearbyRetry}
        />
      </div>
      <ChatSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />
    </section>
  );
}
