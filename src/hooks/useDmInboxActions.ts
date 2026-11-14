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
  snapshotDmInbox,
} from '@/lib/dmInboxCachePatch';
import { useHideConversation } from '@/hooks/useHiddenConversations';
import { useLockConversation, useUnlockConversation } from '@/hooks/useLockedChats';
import { useMarkConversationRead } from '@/hooks/useDMConversations';
import { useDmMemberPreference } from '@/hooks/useDmMemberPreference';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { activeDmListKeys, viewerDmMembership } from '@/lib/dmAccountScope';
import { reportAccountGuard } from '@/lib/reportModerationService';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

export function useDmInboxActions(conversation: LoadedDMConversation) {
  const profileId = useAuthProfileId();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const session = useReportAccountSession();
  const guard = () => {
    reportAccountGuard(session.uid)();
    if (!profileId || !activeDmListKeys(profileId, session).length) throw new Error('Your account session changed.');
  };
  const snapshot = () => { guard(); return profileId ? snapshotDmInbox(qc, profileId, session) : undefined; };
  const hideConversation = useHideConversation();
  const lockConversation = useLockConversation();
  const unlockConversation = useUnlockConversation();
  const markConversationRead = useMarkConversationRead();

  const member = viewerDmMembership(conversation, profileId, session.uid);
  const memberDocId = member ? `${conversation.id}_${member.user_id}` : null;

  const togglePin = useDmMemberPreference(conversation, 'is_pinned');
  const toggleMute = useDmMemberPreference(conversation, 'is_muted');

  const markUnread = useMutation({
    mutationFn: async () => {
      guard();
      if (!memberDocId || !conversation.last_message?.created_at) throw new Error('Refresh Messages before marking unread');
      const lastAt = new Date(conversation.last_message.created_at);
      lastAt.setSeconds(lastAt.getSeconds() - 1);
      const { error } = await db
        .from('conversation_members')
        .update({ last_read_at: lastAt.toISOString() })
        .eq('id', memberDocId);
      if (error) throw error;
    },
    onMutate: async () => {
      const rollback = snapshot();
      if (!profileId) return rollback;
      patchDmConversationInCache(qc, profileId, conversation.id, {
        unread_count: Math.max(1, conversation.unread_count || 1),
        _hasUnread: true,
      }, session);
      rollback?.capture();
      return rollback;
    },
    onSuccess: () => {
      try { guard(); } catch { return; }
      toast.success('Marked unread');
    },
    onError: (_error, _variables, rollback) => {
      try { guard(); } catch { return; }
      rollback?.restore();
      if (profileId) invalidateConversationCaches(qc, profileId, session);
      toast.error('Could not mark unread');
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      guard();
      if (!profileId) throw new Error('Not signed in');
      await hideConversation.mutateAsync(conversation.id);
    },
    onMutate: async () => {
      const rollback = snapshot();
      if (!profileId) return rollback;
      removeDmConversationFromCache(qc, profileId, conversation.id, session);
      rollback?.capture();
      return rollback;
    },
    onSuccess: () => { try { guard(); toast.success('Archived'); } catch { /* retired session */ } },
    onError: (_error, _variables, rollback) => {
      try { guard(); } catch { return; }
      rollback?.restore();
      if (profileId) invalidateConversationCaches(qc, profileId, session);
      toast.error('Could not archive');
    },
  });

  const toggleLock = useMutation({
    mutationFn: async (lock: boolean) => {
      guard();
      if (lock) await lockConversation.mutateAsync(conversation.id);
      else await unlockConversation.mutateAsync(conversation.id);
    },
    onMutate: async (lock) => {
      const rollback = snapshot();
      if (!profileId) return rollback;
      patchLockedChatsCache(qc, profileId, conversation.id, lock, session);
      if (lock) removeDmConversationFromCache(qc, profileId, conversation.id, session);
      rollback?.capture();
      return rollback;
    },
    onSuccess: (_, lock) => { try { guard(); toast.success(lock ? 'Chat locked' : 'Chat unlocked'); } catch { /* retired session */ } },
    onError: (_error, _variables, rollback) => {
      try { guard(); } catch { return; }
      rollback?.restore();
      if (profileId) {
        invalidateConversationCaches(qc, profileId, session);
        qc.invalidateQueries({ queryKey: ['locked-chats', profileId] });
      }
      toast.error('Could not update lock');
    },
  });

  const markRead = useMutation({
    mutationFn: async () => {
      guard();
      await markConversationRead.mutateAsync(conversation.id);
    },
    onMutate: async () => {
      const rollback = snapshot();
      if (!profileId) return rollback;
      patchDmConversationInCache(qc, profileId, conversation.id, {
        unread_count: 0,
        _hasUnread: false,
      }, session);
      rollback?.capture();
      return rollback;
    },
    onError: (_error, _variables, rollback) => {
      try { guard(); } catch { return; }
      rollback?.restore();
      if (profileId) invalidateConversationCaches(qc, profileId, session);
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
