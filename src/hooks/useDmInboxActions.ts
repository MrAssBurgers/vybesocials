import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { patchDmConversationInCache, patchLockedChatsCache, removeDmConversationFromCache, snapshotDmInbox } from '@/lib/dmInboxCachePatch';
import { useDmMemberPreference } from '@/hooks/useDmMemberPreference';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { activeDmListKeys, isDmConversationForViewer, ownedDmProfileId, viewerDmMembership } from '@/lib/dmAccountScope';
import { getSessionAuthUid, markConversationReadForViewer } from '@/lib/markConversationRead';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

/** Carry the initiating identity through queued dispatch, optimism and callbacks. */
export function useDmInboxActions(conversation: LoadedDMConversation) {
  const { user, profile } = useAuth();
  const profileId = ownedDmProfileId(user?.id, profile);
  const session = useReportAccountSession();
  const client = useQueryClient();
  const guard = () => {
    if (!profileId || !activeDmListKeys(profileId, session).length) throw new Error('Your account session changed.');
  };
  const start = () => {
    guard();
    if (!profileId || !isDmConversationForViewer(conversation, profileId, session.uid)) throw new Error('Refresh Messages before updating this chat.');
    const member = viewerDmMembership(conversation, profileId, session.uid);
    return { profileId, session, guard, conversationId: conversation.id,
      memberDocId: member ? `${conversation.id}_${member.user_id}` : null,
      lastMessageAt: conversation.last_message?.created_at, unreadCount: conversation.unread_count };
  };
  type Operation = ReturnType<typeof start>;
  const snapshot = (operation: Operation) => {
    operation.guard();
    return snapshotDmInbox(client, operation.profileId, operation.session);
  };
  const failed = (operation: Operation, rollback: { restore: () => void } | undefined, message: string) => {
    try { operation.guard(); } catch { return; }
    rollback?.restore();
    invalidateConversationCaches(client, operation.profileId, operation.session);
    toast.error(message);
  };
  const succeeded = (operation: Operation, message: string) => {
    try { operation.guard(); } catch { return; }
    toast.success(message);
  };
  const markUnreadMutation = useMutation({
    mutationFn: async (operation: Operation) => {
      operation.guard();
      if (!operation.memberDocId || !operation.lastMessageAt) throw new Error('Refresh Messages before marking unread.');
      const lastAt = new Date(operation.lastMessageAt);
      lastAt.setSeconds(lastAt.getSeconds() - 1);
      const { error } = await db.from('conversation_members').update({ last_read_at: lastAt.toISOString() }).eq('id', operation.memberDocId);
      operation.guard(); if (error) throw error;
    },
    onMutate: (operation: Operation) => {
      const rollback = snapshot(operation);
      patchDmConversationInCache(client, operation.profileId, operation.conversationId,
        { unread_count: Math.max(1, operation.unreadCount || 1), _hasUnread: true }, operation.session);
      rollback.capture(); return rollback;
    },
    onSuccess: (_result, operation) => succeeded(operation, 'Marked unread'),
    onError: (_error, operation, rollback) => failed(operation, rollback, 'Could not mark unread'),
  });
  const markReadMutation = useMutation({
    mutationFn: async (operation: Operation) => {
      operation.guard();
      const uid = await getSessionAuthUid();
      operation.guard();
      if (uid !== operation.session.uid) throw new Error('Your account session changed.');
      await markConversationReadForViewer(operation.conversationId, operation.profileId, uid, operation.guard);
      operation.guard();
    },
    onMutate: (operation: Operation) => {
      const rollback = snapshot(operation);
      patchDmConversationInCache(client, operation.profileId, operation.conversationId,
        { unread_count: 0, _hasUnread: false }, operation.session);
      rollback.capture(); return rollback;
    },
    onSuccess: (_result, operation) => {
      try { operation.guard(); } catch { return; }
      void client.invalidateQueries({ queryKey: ['unread-messages-count', operation.profileId], exact: true });
    },
    onError: (_error, operation, rollback) => failed(operation, rollback, 'Could not mark read'),
  });
  const archiveMutation = useMutation({
    mutationFn: async (operation: Operation) => {
      operation.guard();
      const { error } = await db.from('hidden_conversations').insert({ user_id: operation.profileId, conversation_id: operation.conversationId });
      operation.guard(); if (error) throw error;
    },
    onMutate: (operation: Operation) => {
      const rollback = snapshot(operation);
      removeDmConversationFromCache(client, operation.profileId, operation.conversationId, operation.session);
      rollback.capture(); return rollback;
    },
    onSuccess: (_result, operation) => {
      try { operation.guard(); } catch { return; }
      void client.invalidateQueries({ queryKey: ['hidden-conversations', operation.profileId], exact: true });
      invalidateConversationCaches(client, operation.profileId, operation.session);
      succeeded(operation, 'Archived');
    },
    onError: (_error, operation, rollback) => failed(operation, rollback, 'Could not archive'),
  });
  type LockOperation = Operation & { locked: boolean };
  const lockMutation = useMutation({
    mutationFn: async (operation: LockOperation) => {
      operation.guard();
      const result = operation.locked
        ? await db.from('locked_chats').upsert({ conversation_id: operation.conversationId, user_id: operation.profileId, locked_at: new Date().toISOString(), preview_hidden: true })
        : await db.from('locked_chats').delete().eq('user_id', operation.profileId).eq('conversation_id', operation.conversationId);
      operation.guard(); if (result.error) throw result.error;
    },
    onMutate: (operation: LockOperation) => {
      const rollback = snapshot(operation);
      const key = ['locked-chats', operation.profileId];
      const before = client.getQueryData(key);
      patchLockedChatsCache(client, operation.profileId, operation.conversationId, operation.locked, operation.session);
      const after = client.getQueryData(key);
      if (operation.locked) removeDmConversationFromCache(client, operation.profileId, operation.conversationId, operation.session);
      rollback.capture();
      return { restore: () => {
        operation.guard(); rollback.restore();
        if (client.getQueryData(key) === after) {
          if (before === undefined) client.removeQueries({ queryKey: key, exact: true });
          else client.setQueryData(key, before);
        }
      } };
    },
    onSuccess: (_result, operation) => {
      try { operation.guard(); } catch { return; }
      void client.invalidateQueries({ queryKey: ['locked-chats', operation.profileId], exact: true });
      invalidateConversationCaches(client, operation.profileId, operation.session);
      succeeded(operation, operation.locked ? 'Chat locked' : 'Chat unlocked');
    },
    onError: (_error, operation, rollback) => failed(operation, rollback, 'Could not update lock'),
  });
  const bind = <T,>(mutation: { mutate: (operation: Operation) => void; mutateAsync: (operation: Operation) => Promise<T> }) => ({
    mutate: () => { try { mutation.mutate(start()); } catch { /* Retired controls cannot dispatch. */ } },
    mutateAsync: async () => mutation.mutateAsync(start()),
  });
  const markUnread = { ...markUnreadMutation, ...bind(markUnreadMutation) };
  const markRead = { ...markReadMutation, ...bind(markReadMutation) };
  const archive = { ...archiveMutation, ...bind(archiveMutation) };
  const toggleLock = { ...lockMutation,
    mutate: (locked: boolean) => { try { lockMutation.mutate({ ...start(), locked }); } catch { /* Retired control. */ } },
    mutateAsync: async (locked: boolean) => lockMutation.mutateAsync({ ...start(), locked }),
  };
  const togglePin = useDmMemberPreference(conversation, 'is_pinned');
  const toggleMute = useDmMemberPreference(conversation, 'is_muted');
  const toggleRead = useCallback((currentlyUnread: boolean) => {
    if (currentlyUnread) markRead.mutate(); else markUnread.mutate();
  }, [markRead, markUnread]);
  return { isPinned: togglePin.value, isMuted: toggleMute.value, togglePin, toggleMute,
    markUnread, markRead, toggleRead, archive, toggleLock, profileId };
}
