import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { patchDmConversationInCache, patchLockedChatsCache, removeDmConversationFromCache, snapshotDmInbox } from '@/lib/dmInboxCachePatch';
import { viewerDmMembership, isDmConversationForViewer } from '@/lib/dmAccountScope';
import { getDocumentFromServer, updateDocument } from '@/lib/firebase/firestoreDb';
import { useHideConversation } from './useHiddenConversations';
import { useLockConversation, useUnlockConversation } from './useLockedChats';
import { useMarkConversationRead } from './useDMConversations';
import { useDmMemberPreference } from './useDmMemberPreference';
import { useDmAccountMutation, dmPrivateKey, type DmActor } from './useDmAccountMutation';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

export function useDmInboxActions(conversation: LoadedDMConversation) {
  const { profile } = useAuth();
  const client = useQueryClient();
  const hideConversation = useHideConversation({ quiet: true });
  const lockConversation = useLockConversation(), unlockConversation = useUnlockConversation();
  const markConversationRead = useMarkConversationRead();
  const togglePin = useDmMemberPreference(conversation, 'is_pinned');
  const toggleMute = useDmMemberPreference(conversation, 'is_muted');
  const snapshot = (actor: DmActor, row: LoadedDMConversation) => {
    if (!isDmConversationForViewer(row, actor.profileId, actor.uid)) throw new Error('Refresh Messages before updating this chat.');
    return snapshotDmInbox(client, actor.profileId, actor.session, row.id);
  };
  const failed = (actor: DmActor, restore: ReturnType<typeof snapshotDmInbox> | undefined, label: string) => {
    restore?.restore(); invalidateConversationCaches(client, actor.profileId, actor.session); toast.error(label);
  };
  const markUnread = useDmAccountMutation({
    capture: (_value: void) => conversation,
    mutationFn: async ({ value: row, actor }) => {
      const member = viewerDmMembership(row, actor.profileId, actor.uid);
      const lastAt = Date.parse(row.last_message?.created_at || '');
      if (!member || !Number.isFinite(lastAt)) throw new Error('Refresh Messages before marking unread');
      const id = `${row.id}_${member.user_id}`;
      const stored = await getDocumentFromServer('conversation_members', id); actor.guard();
      if (!stored || stored.conversation_id !== row.id || stored.user_id !== member.user_id) throw new Error('Your chat membership could not be confirmed.');
      await updateDocument('conversation_members', id, { last_read_at: new Date(lastAt - 1000).toISOString() }); actor.guard();
    },
    onMutate: ({ value: row, actor }) => {
      const restore = snapshot(actor, row);
      patchDmConversationInCache(client, actor.profileId, row.id, { unread_count: Math.max(1, row.unread_count || 1), _hasUnread: true }, actor.session);
      restore.capture(); return restore;
    },
    onSuccess: () => toast.success('Marked unread'),
    onError: (_error, { actor }, restore) => failed(actor, restore, 'Could not mark unread'),
  });
  const markRead = useDmAccountMutation({
    capture: (_value: void) => conversation,
    mutationFn: async ({ value: row, actor }) => { actor.guard(); await markConversationRead.mutateAsync(row.id); actor.guard(); },
    onMutate: ({ value: row, actor }) => {
      const restore = snapshot(actor, row);
      patchDmConversationInCache(client, actor.profileId, row.id, { unread_count: 0, _hasUnread: false }, actor.session);
      restore.capture(); return restore;
    },
    onError: (_error, { actor }, restore) => failed(actor, restore, 'Could not mark read'),
  });
  const archive = useDmAccountMutation({
    capture: (_value: void) => conversation,
    mutationFn: async ({ value: row, actor }) => { actor.guard(); await hideConversation.mutateAsync(row.id); actor.guard(); },
    onMutate: ({ value: row, actor }) => {
      const restore = snapshot(actor, row); removeDmConversationFromCache(client, actor.profileId, row.id, actor.session); restore.capture(); return restore;
    },
    onSuccess: () => toast.success('Archived'),
    onError: (_error, { actor }, restore) => failed(actor, restore, 'Could not archive'),
  });
  const toggleLock = useDmAccountMutation({
    capture: (lock: boolean) => ({ row: conversation, lock }),
    mutationFn: async ({ value: { row, lock }, actor }) => { actor.guard(); await (lock ? lockConversation : unlockConversation).mutateAsync(row.id); actor.guard(); },
    onMutate: ({ value: { row, lock }, actor }) => {
      const inbox = snapshot(actor, row), key = dmPrivateKey('locked-chats', actor), before = client.getQueryData(key);
      patchLockedChatsCache(client, actor.profileId, row.id, lock, actor.session);
      const after = client.getQueryData(key);
      if (lock) removeDmConversationFromCache(client, actor.profileId, row.id, actor.session);
      inbox.capture();
      return { restore: () => { inbox.restore(); if (client.getQueryData(key) === after) { if (before === undefined) client.removeQueries({ queryKey: key, exact: true }); else client.setQueryData(key, before); } } };
    },
    onSuccess: (_data, { value: { lock } }) => toast.success(lock ? 'Chat locked' : 'Chat unlocked'),
    onError: (_error, { actor }, restore) => {
      restore?.restore(); invalidateConversationCaches(client, actor.profileId, actor.session);
      void client.invalidateQueries({ queryKey: dmPrivateKey('locked-chats', actor), exact: true }); toast.error('Could not update lock');
    },
  });
  const toggleRead = useCallback((currentlyUnread: boolean) => { if (currentlyUnread) markRead.mutate(); else markUnread.mutate(); }, [markRead, markUnread]);
  return { isPinned: togglePin.value, isMuted: toggleMute.value, togglePin, toggleMute, markUnread, markRead, toggleRead, archive, toggleLock, profileId: profile?.id };
}
