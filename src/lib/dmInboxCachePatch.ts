import type { QueryClient } from '@tanstack/react-query';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { readQueryArray, safeDmMembers } from '@/lib/persistedCollections';

function patchList(
  queryClient: QueryClient,
  profileId: string,
  apply: (list: LoadedDMConversation[]) => LoadedDMConversation[] | undefined,
): void {
  const run = (old: unknown) => {
    const list = readQueryArray<LoadedDMConversation>(old);
    if (!list.length) return old;
    const next = apply(list);
    return next ?? old;
  };
  queryClient.setQueryData(['dm-conversations', profileId], run);
  queryClient.setQueryData(['conversations', profileId], run);
}

export function patchDmConversationInCache(
  queryClient: QueryClient,
  profileId: string,
  conversationId: string,
  patch: Partial<LoadedDMConversation>,
): void {
  patchList(queryClient, profileId, (list) =>
    list.map((conv) => (conv.id === conversationId ? { ...conv, ...patch } : conv)),
  );
}

export function patchDmMemberInCache(
  queryClient: QueryClient,
  profileId: string,
  conversationId: string,
  memberPatch: {
    is_pinned?: boolean;
    is_muted?: boolean;
    last_read_at?: string;
  },
): void {
  patchList(queryClient, profileId, (list) =>
    list.map((conv) => {
      if (conv.id !== conversationId) return conv;
      const members = safeDmMembers(conv.members).map((member) => {
        if (member.user_id !== profileId) return member;
        return { ...member, ...memberPatch };
      });
      return { ...conv, members };
    }),
  );
}

export function removeDmConversationFromCache(
  queryClient: QueryClient,
  profileId: string,
  conversationId: string,
): void {
  patchList(queryClient, profileId, (list) =>
    list.filter((conv) => conv.id !== conversationId),
  );
}

export function patchLockedChatsCache(
  queryClient: QueryClient,
  profileId: string,
  conversationId: string,
  locked: boolean,
): void {
  queryClient.setQueryData<Set<string>>(['locked-chats', profileId], (old) => {
    const next = new Set(old ?? []);
    if (locked) next.add(conversationId);
    else next.delete(conversationId);
    return next;
  });
}
