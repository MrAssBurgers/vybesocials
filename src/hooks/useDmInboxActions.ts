import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { useHideConversation } from '@/hooks/useHiddenConversations';
import { useLockConversation, useUnlockConversation } from '@/hooks/useLockedChats';
import { safeDmMembers } from '@/lib/persistedCollections';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

export function useDmInboxActions(conversation: LoadedDMConversation) {
  const profileId = useAuthProfileId();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const hideConversation = useHideConversation();
  const lockConversation = useLockConversation();
  const unlockConversation = useUnlockConversation();

  const memberDocId = profileId ? `${conversation.id}_${profileId}` : null;

  const togglePin = useMutation({
    mutationFn: async (pin: boolean) => {
      if (!memberDocId) throw new Error('Not signed in');
      const { error } = await db
        .from('conversation_members')
        .update({ is_pinned: pin })
        .eq('id', memberDocId);
      if (error) throw error;
    },
    onSuccess: (_, pin) => {
      invalidateConversationCaches(qc);
      toast.success(pin ? 'Pinned' : 'Unpinned');
    },
  });

  const toggleMute = useMutation({
    mutationFn: async (mute: boolean) => {
      if (!memberDocId) throw new Error('Not signed in');
      const { error } = await db
        .from('conversation_members')
        .update({ is_muted: mute })
        .eq('id', memberDocId);
      if (error) throw error;
    },
    onSuccess: (_, mute) => {
      invalidateConversationCaches(qc);
      toast.success(mute ? 'Muted' : 'Unmuted');
    },
  });

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
    onSuccess: () => {
      invalidateConversationCaches(qc);
      toast.success('Marked unread');
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error('Not signed in');
      await hideConversation.mutateAsync(conversation.id);
    },
    onSuccess: () => toast.success('Archived'),
  });

  const toggleLock = useMutation({
    mutationFn: async (lock: boolean) => {
      if (lock) await lockConversation.mutateAsync(conversation.id);
      else await unlockConversation.mutateAsync(conversation.id);
    },
    onSuccess: (_, lock) => toast.success(lock ? 'Chat locked' : 'Chat unlocked'),
  });

  const myMembership = safeDmMembers(conversation.members).find((m) => m.user_id === profileId);
  const isPinned = Boolean(myMembership?.is_pinned);
  const isMuted = Boolean(myMembership?.is_muted);

  return {
    isPinned,
    isMuted,
    togglePin,
    toggleMute,
    markUnread,
    archive,
    toggleLock,
    profileId: profile?.id ?? profileId,
  };
}
