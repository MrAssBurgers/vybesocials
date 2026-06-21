/**
 * Firestore requires message listeners to be scoped by conversation_id.
 * An unfiltered messages collection query is rejected by security rules.
 */
import type { QueryClient } from '@tanstack/react-query';
import { startTransition } from 'react';
import { db } from '@/lib/firebase';
import { callSounds } from '@/lib/callSounds';
import { appendIncomingMessage } from '@/lib/messagesQueryKey';
import {
  removeChannelByTopic,
  removeRealtimeChannel,
  subscribePostgresChannel,
  type RealtimeChannel,
} from '@/lib/realtimeChannel';

export interface ScopedMessageRealtimeContext {
  profileId: string;
  authUid: string | null;
  queryClient: QueryClient;
  getViewingConversationId: () => string | null;
  isMessageProcessed: (id: string) => boolean;
  markMessageProcessed: (id: string) => void;
  isOptimisticDuplicate: (conversationId: string, content: string, senderId: string) => boolean;
  scheduleUnknownConvoRefetch: (profileId: string) => void;
}

function collectConversationIds(
  queryClient: QueryClient,
  profileId: string,
  getViewingConversationId: () => string | null,
): Set<string> {
  const ids = new Set<string>();
  for (const key of ['dm-conversations', 'conversations'] as const) {
    const cached = queryClient.getQueryData<any[]>([key, profileId]);
    cached?.forEach((c) => c?.id && ids.add(c.id));
  }
  const viewing = getViewingConversationId();
  if (viewing) ids.add(viewing);
  return ids;
}

async function fetchMembershipConversationIds(
  profileId: string,
  authUid: string | null,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data: rows } = await db
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', profileId);
  rows?.forEach((r: { conversation_id?: string }) => r.conversation_id && ids.add(r.conversation_id));

  if (authUid && authUid !== profileId) {
    const { data: authRows } = await db
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', authUid);
    authRows?.forEach((r: { conversation_id?: string }) => r.conversation_id && ids.add(r.conversation_id));
  }
  return ids;
}

function patchConversationLists(
  ctx: ScopedMessageRealtimeContext,
  conversationId: string,
  newMessage: any,
  isFromCurrentUser: boolean,
  isViewingConvo: boolean,
) {
  startTransition(() => {
    const updateConversations = (old: any[] | undefined) => {
      if (!old) return old;
      if (!old.some((c) => c.id === conversationId)) return old;

      return old
        .map((conv) => {
          if (conv.id !== conversationId) return conv;
          return {
            ...conv,
            last_message: {
              id: newMessage.id,
              content: newMessage.content,
              media_type: newMessage.media_type,
              media_url: newMessage.media_url,
              message_type: newMessage.message_type,
              created_at: newMessage.created_at,
              sender_id: newMessage.sender_id,
            },
            updated_at: newMessage.created_at,
            _sortTime: newMessage.created_at,
            _hasUnread: !isFromCurrentUser && !isViewingConvo,
            unread_count:
              !isFromCurrentUser && !isViewingConvo
                ? (conv.unread_count || 0) + 1
                : conv.unread_count,
          };
        })
        .sort((a, b) => {
          const aIsPinned = a.members?.find((m: any) => m.user_id === ctx.profileId)?.is_pinned;
          const bIsPinned = b.members?.find((m: any) => m.user_id === ctx.profileId)?.is_pinned;
          if (aIsPinned && !bIsPinned) return -1;
          if (!aIsPinned && bIsPinned) return 1;
          if (a._hasUnread && !b._hasUnread) return -1;
          if (!a._hasUnread && b._hasUnread) return 1;
          const timeA = new Date(a._sortTime || a.updated_at).getTime();
          const timeB = new Date(b._sortTime || b.updated_at).getTime();
          return timeB - timeA;
        });
    };

    ctx.queryClient.setQueryData<any[]>(['conversations', ctx.profileId], updateConversations);
    ctx.queryClient.setQueryData<any[]>(['dm-conversations', ctx.profileId], updateConversations);

    const cached = ctx.queryClient.getQueryData<any[]>(['dm-conversations', ctx.profileId]);
    if (cached && !cached.some((c) => c.id === conversationId)) {
      ctx.scheduleUnknownConvoRefetch(ctx.profileId);
    }
  });
}

function handleMessageInsert(ctx: ScopedMessageRealtimeContext, newMessage: any) {
  const conversationId = newMessage.conversation_id;
  const isFromCurrentUser =
    newMessage.sender_id === ctx.profileId ||
    (!!ctx.authUid && newMessage.sender_id === ctx.authUid);
  const isViewingConvo = ctx.getViewingConversationId() === conversationId;

  if (ctx.isMessageProcessed(newMessage.id)) return;
  ctx.markMessageProcessed(newMessage.id);

  const skipReceiverInsert =
    isFromCurrentUser &&
    ctx.isOptimisticDuplicate(conversationId, newMessage.content, newMessage.sender_id);

  if (isFromCurrentUser && isViewingConvo && !skipReceiverInsert) {
    ctx.queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
      const row = { ...newMessage, views: [], reactions: [] };
      return appendIncomingMessage(old, row);
    });
  }

  if (!skipReceiverInsert && !isFromCurrentUser) {
    let sender: any = null;
    const cachedConvos =
      ctx.queryClient.getQueryData<any[]>(['dm-conversations', ctx.profileId]) ||
      ctx.queryClient.getQueryData<any[]>(['conversations', ctx.profileId]);

    if (cachedConvos) {
      const cachedConvo = cachedConvos.find((c) => c.id === conversationId);
      const memberProfile = cachedConvo?.members?.find(
        (m: any) => m.user_id === newMessage.sender_id,
      )?.profile;
      if (memberProfile) sender = memberProfile;
    }

    const fullMessage = { ...newMessage, sender, views: [], reactions: [] };

    ctx.queryClient.setQueryData<any[]>(['messages', conversationId], (old) =>
      appendIncomingMessage(old, fullMessage),
    );

    if (!sender) {
      void db
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .eq('id', newMessage.sender_id)
        .maybeSingle()
        .then(({ data: fetchedSender }) => {
          if (!fetchedSender) return;
          ctx.queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
            if (!old?.length) return old;
            return old.map((m) =>
              m.id === newMessage.id ? { ...m, sender: fetchedSender } : m,
            );
          });
        })
        .catch(() => {});
    }

    if (!isViewingConvo || document.visibilityState !== 'visible') {
      callSounds.message();
    }
  }

  patchConversationLists(ctx, conversationId, newMessage, isFromCurrentUser, isViewingConvo);
}

function handleMessageUpdate(ctx: ScopedMessageRealtimeContext, updatedMessage: any) {
  const conversationId = updatedMessage.conversation_id;
  const updateKey = `update:${updatedMessage.id}:${updatedMessage.updated_at || updatedMessage.edited_at}`;
  if (ctx.isMessageProcessed(updateKey)) return;
  ctx.markMessageProcessed(updateKey);

  ctx.queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
    if (!old) return old;

    if (updatedMessage.is_deleted) {
      const isFromCurrentUser =
        updatedMessage.sender_id === ctx.profileId ||
        (!!ctx.authUid && updatedMessage.sender_id === ctx.authUid);
      const createdMs = new Date(updatedMessage.created_at || 0).getTime();
      const isRecentOwnSend = isFromCurrentUser && Date.now() - createdMs < 60_000;

      if (isRecentOwnSend) {
        const content = (updatedMessage.content || '').trim();
        const matchingTemp = old.find(
          (m) =>
            typeof m.id === 'string' &&
            m.id.startsWith('temp-') &&
            (m.content || '').trim() === content,
        );
        if (matchingTemp) {
          return old.map((m) =>
            m.id === matchingTemp.id
              ? ({ ...m, _failed: true, _error: 'Message could not be delivered' } as any)
              : m,
          );
        }
        return old.map((m) =>
          m.id === updatedMessage.id
            ? ({ ...m, _failed: true, _error: 'Message could not be delivered' } as any)
            : m,
        );
      }
      return old.filter((m) => m.id !== updatedMessage.id);
    }

    return old.map((m) => (m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m));
  });

  if (updatedMessage.is_deleted) {
    ctx.scheduleUnknownConvoRefetch(ctx.profileId);
  }
}

function handleMessageDelete(ctx: ScopedMessageRealtimeContext, deletedMessage: any) {
  const conversationId = deletedMessage.conversation_id;
  if (!conversationId) return;

  const isFromCurrentUser =
    deletedMessage.sender_id === ctx.profileId ||
    (!!ctx.authUid && deletedMessage.sender_id === ctx.authUid);
  const createdMs = new Date(deletedMessage.created_at || 0).getTime();
  const isRecentOwnSend = isFromCurrentUser && Date.now() - createdMs < 60_000;

  ctx.queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
    if (!old) return old;

    if (isRecentOwnSend) {
      const content = (deletedMessage.content || '').trim();
      const matchingTemp = old.find(
        (m) =>
          typeof m.id === 'string' &&
          m.id.startsWith('temp-') &&
          (m.content || '').trim() === content,
      );
      if (matchingTemp) {
        return old.map((m) =>
          m.id === matchingTemp.id
            ? ({ ...m, _failed: true, _error: 'Message could not be delivered' } as any)
            : m,
        );
      }
      if (old.some((m) => m.id === deletedMessage.id)) {
        return old.map((m) =>
          m.id === deletedMessage.id
            ? ({ ...m, _failed: true, _error: 'Message could not be delivered' } as any)
            : m,
        );
      }
    }

    return old.filter((m) => m.id !== deletedMessage.id);
  });

  ctx.scheduleUnknownConvoRefetch(ctx.profileId);
}

export interface ScopedMessageRealtimeHandle {
  resync: () => Promise<void>;
  teardown: () => void;
}

export function setupScopedMessageRealtime(
  ctx: ScopedMessageRealtimeContext,
): ScopedMessageRealtimeHandle {
  const convChannels = new Map<string, RealtimeChannel>();
  let membersChannel: RealtimeChannel | null = null;
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  const attachConversation = (conversationId: string) => {
    if (convChannels.has(conversationId)) return;

    const ch = subscribePostgresChannel(
      `global-messages:${ctx.profileId}:${conversationId}`,
      [
        {
          event: 'INSERT',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
          callback: (payload) => {
            try {
              handleMessageInsert(ctx, payload.new);
            } catch (err) {
              if (import.meta.env.DEV) console.warn('[GlobalRT] INSERT failed', err);
            }
          },
        },
        {
          event: 'UPDATE',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
          callback: (payload) => handleMessageUpdate(ctx, payload.new),
        },
        {
          event: 'DELETE',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
          callback: (payload) => handleMessageDelete(ctx, payload.old),
        },
      ],
      (status) => {
        if (import.meta.env.DEV && status === 'SUBSCRIBED') {
          console.log('[GlobalRT] ✅ Listening:', conversationId);
        }
      },
    );
    convChannels.set(conversationId, ch);
  };

  const syncConversationListeners = async () => {
    const ids = collectConversationIds(ctx.queryClient, ctx.profileId, ctx.getViewingConversationId);
    try {
      const fromDb = await fetchMembershipConversationIds(ctx.profileId, ctx.authUid);
      fromDb.forEach((id) => ids.add(id));
    } catch {
      /* cache-only fallback */
    }

    for (const [cid, ch] of convChannels) {
      if (!ids.has(cid)) {
        removeRealtimeChannel(ch);
        removeChannelByTopic(`global-messages:${ctx.profileId}:${cid}`);
        convChannels.delete(cid);
      }
    }

    ids.forEach((cid) => attachConversation(cid));

    if (import.meta.env.DEV) {
      console.log('[GlobalRT] Scoped listeners:', convChannels.size, 'conversations');
    }
  };

  const scheduleSync = () => {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      void syncConversationListeners();
    }, 300);
  };

  membersChannel = subscribePostgresChannel(
    `global-members:${ctx.profileId}`,
    [
      {
        event: '*',
        table: 'conversation_members',
        filter: `user_id=eq.${ctx.profileId}`,
        callback: () => scheduleSync(),
      },
      ...(ctx.authUid && ctx.authUid !== ctx.profileId
        ? [
            {
              event: '*' as const,
              table: 'conversation_members',
              filter: `user_id=eq.${ctx.authUid}`,
              callback: () => scheduleSync(),
            },
          ]
        : []),
    ],
    (status) => {
      if (status === 'SUBSCRIBED' && import.meta.env.DEV) {
        console.log('[GlobalRT] ✅ Membership listener active');
      }
    },
  );

  void syncConversationListeners();

  return {
    resync: syncConversationListeners,
    teardown: () => {
      if (syncTimer) clearTimeout(syncTimer);
      removeRealtimeChannel(membersChannel);
      membersChannel = null;
      removeChannelByTopic(`global-members:${ctx.profileId}`);
      for (const [cid, ch] of convChannels) {
        removeRealtimeChannel(ch);
        removeChannelByTopic(`global-messages:${ctx.profileId}:${cid}`);
      }
      convChannels.clear();
    },
  };
}

/** Apply a broadcast payload to caches (instant path while Firestore catches up). */
export function applyBroadcastMessage(
  ctx: ScopedMessageRealtimeContext,
  msg: Record<string, unknown>,
) {
  if (!msg?.id || !msg.conversation_id) return;
  const conversationId = String(msg.conversation_id);
  if (ctx.isMessageProcessed(String(msg.id))) return;
  ctx.markMessageProcessed(String(msg.id));

  const isFromCurrentUser =
    msg.sender_id === ctx.profileId || (!!ctx.authUid && msg.sender_id === ctx.authUid);
  const isViewingConvo = ctx.getViewingConversationId() === conversationId;

  ctx.queryClient.setQueryData<any[]>(['messages', conversationId], (old) =>
    appendIncomingMessage(old, msg as any),
  );

  if (!isFromCurrentUser && (!isViewingConvo || document.visibilityState !== 'visible')) {
    callSounds.message();
  }

  patchConversationLists(ctx, conversationId, msg, isFromCurrentUser, isViewingConvo);
}
