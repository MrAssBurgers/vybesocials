import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import {
  patchDmConversationInCache,
  patchLockedChatsCache,
  removeDmConversationFromCache,
} from '@/lib/dmInboxCachePatch';
import { useHideConversation } from '@/hooks/useHiddenConversations';
import { useLockConversation, useUnlockConversation } from '@/hooks/useLockedChats';
import { useMarkConversationRead } from '@/hooks/useDMConversations';
import { useDmMemberPreference } from '@/hooks/useDmMemberPreference';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

export function useDmInboxActions(conversation: LoadedDMConversation) {
  const profileId = useAuthProfileId();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const hideConversation = useHideConversation();
  const lockConversation = useLockConversation();
  const unlockConversation = useUnlockConversation();
  const markConversationRead = useMarkConversationRead();

  const memberDocId = profileId ? `${conversation.id}_${profileId}` : null;

  const togglePin = useDmMemberPreference(conversation, 'is_pinned');
  const toggleMute = useDmMemberPreference(conversation, 'is_muted');

  const markUnread = useMutation({
    mutationFn: async () => {
      if (!memberDocId || !conversation.last_message?.created_at) return;
      const lastAt = new Date(conversation.last_message.created_at);
      lastAt.setSeconds(lastAt.getSeconds() - 1);
      const { error } = await db
        .from('conversation_members')
        .update({ last_read_at: lastAt.toISOString() })
        .eq('id', memberDocId);
      if (error) throw error;
    },
    onMutate: async () => {
      if (!profileId) return;
      patchDmConversationInCache(qc, profileId, conversation.id, {
        unread_count: Math.max(1, conversation.unread_count || 1),
        _hasUnread: true,
      });
    },
    onSuccess: () => {
      toast.success('Marked unread');
    },
    onError: () => {
      if (profileId) invalidateConversationCaches(qc, profileId);
      toast.error('Could not mark unread');
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error('Not signed in');
      await hideConversation.mutateAsync(conversation.id);
    },
    onMutate: async () => {
      if (!profileId) return;
      removeDmConversationFromCache(qc, profileId, conversation.id);
    },
    onSuccess: () => toast.success('Archived'),
    onError: () => {
      if (profileId) invalidateConversationCaches(qc, profileId);
      toast.error('Could not archive');
    },
  });

  const toggleLock = useMutation({
    mutationFn: async (lock: boolean) => {
      if (lock) await lockConversation.mutateAsync(conversation.id);
      else await unlockConversation.mutateAsync(conversation.id);
    },
    onMutate: async (lock) => {
      if (!profileId) return;
      patchLockedChatsCache(qc, profileId, conversation.id, lock);
      if (lock) removeDmConversationFromCache(qc, profileId, conversation.id);
    },
    onSuccess: (_, lock) => toast.success(lock ? 'Chat locked' : 'Chat unlocked'),
    onError: () => {
      if (profileId) {
        invalidateConversationCaches(qc, profileId);
        qc.invalidateQueries({ queryKey: ['locked-chats', profileId] });
      }
      toast.error('Could not update lock');
    },
  });

  const markRead = useMutation({
    mutationFn: async () => {
      await markConversationRead.mutateAsync(conversation.id);
    },
    onMutate: async () => {
      if (!profileId) return;
      patchDmConversationInCache(qc, profileId, conversation.id, {
        unread_count: 0,
        _hasUnread: false,
      });
    },
    onError: () => {
      if (profileId) invalidateConversationCaches(qc, profileId);
      toast.error('Could not mark read');
    },
  });

  /** Right-swipe entry point — flips whichever read state the row is currently in. */
  const toggleRead = useCallback(
    (currentlyUnread: boolean) => {
      if (currentlyUnread) markRead.mutate();
      else markUnread.mutate();
    },
    [markRead, markUnread],
  );

  const isPinned = togglePin.value;
  const isMuted = toggleMute.value;

  return {
    isPinned,
    isMuted,
    togglePin,
    toggleMute,
    markUnread,
    markRead,
    toggleRead,
    archive,
    toggleLock,
    profileId: profile?.id ?? profileId,
  };
}
