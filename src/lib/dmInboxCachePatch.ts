import type { QueryClient } from '@tanstack/react-query';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { readQueryArray, safeDmMembers } from '@/lib/persistedCollections';
import { activeDmListKeys, isDmConversationForViewer, ownedDmProfileId, viewerDmMembership } from '@/lib/dmAccountScope';
import { reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';

function patchList(
  queryClient: QueryClient,
  profileId: string,
  apply: (list: LoadedDMConversation[]) => LoadedDMConversation[] | undefined,
  session: ReportAccountSession,
): void {
  const run = (old: unknown) => {
    const list = readQueryArray<LoadedDMConversation>(old);
    if (!list.length) return old;
    const next = apply(list);
    return next ?? old;
  };
  for (const key of activeDmListKeys(profileId, session)) {
    if (queryClient.getQueryData(key) !== undefined) queryClient.setQueryData(key, run);
  }
}

export function patchDmConversationInCache(
  queryClient: QueryClient,
  profileId: string,
  conversationId: string,
  patch: Partial<LoadedDMConversation>,
  session: ReportAccountSession = reportAccountSnapshot(),
): void {
  const viewerProfileId = ownedDmProfileId(session.uid) ?? profileId;
  patchList(queryClient, profileId, (list) =>
    list.map((conv) => (conv.id === conversationId && isDmConversationForViewer(conv, viewerProfileId, session.uid) ? { ...conv, ...patch } : conv)), session,
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
  session: ReportAccountSession = reportAccountSnapshot(),
): void {
  patchList(queryClient, profileId, (list) =>
    list.map((conv) => {
      if (conv.id !== conversationId) return conv;
      const viewer = viewerDmMembership(conv, ownedDmProfileId(session.uid) ?? profileId, session.uid);
      if (!viewer) return conv;
      const members = safeDmMembers(conv.members).map((member) => {
        if (member !== viewer) return member;
        return { ...member, ...memberPatch };
      });
      return { ...conv, members };
    }), session,
  );
}

export function removeDmConversationFromCache(
  queryClient: QueryClient,
  profileId: string,
  conversationId: string,
  session: ReportAccountSession = reportAccountSnapshot(),
): void {
  patchList(queryClient, profileId, (list) =>
    list.filter((conv) => conv.id !== conversationId), session,
  );
}

export function patchLockedChatsCache(
  queryClient: QueryClient,
  profileId: string,
  conversationId: string,
  locked: boolean,
  session: ReportAccountSession = reportAccountSnapshot(),
): void {
  if (!activeDmListKeys(profileId, session).length) return;
  queryClient.setQueryData<Set<string>>(['locked-chats', profileId], (old) => {
    const next = new Set(old ?? []);
    if (locked) next.add(conversationId);
    else next.delete(conversationId);
    return next;
  });
}

/** Restore only arrays still bearing this operation's optimistic write. */
export function snapshotDmInbox(client: QueryClient, profileId: string, session: ReportAccountSession) {
  const entries = activeDmListKeys(profileId, session).map(key => ({ key, before: client.getQueryData(key), after: undefined as unknown }));
  return {
    capture: () => entries.forEach(entry => { entry.after = client.getQueryData(entry.key); }),
    restore: () => {
      if (!activeDmListKeys(profileId, session).length) return;
      for (const entry of entries) {
        if (entry.before !== undefined && client.getQueryData(entry.key) === entry.after) client.setQueryData(entry.key, entry.before);
      }
    },
  };
}
