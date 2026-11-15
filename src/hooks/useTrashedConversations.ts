import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { invalidateConversationCaches, patchConversationListCaches } from '@/lib/invalidateConversationCaches';
import { normalizePersistedSet, safeDmMembers } from '@/lib/persistedCollections';
import { fetchMemberProfiles } from '@/lib/dmMembershipRepair';
import { activeDmListKeys, isDmConversationForViewer } from '@/lib/dmAccountScope';
import { snapshotDmInbox } from '@/lib/dmInboxCachePatch';
import { useDmAccountMutation, useDmActorScope, dmPrivateKey, type DmActor } from './useDmAccountMutation';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

export interface TrashedConversation {
  id: string;
  user_id: string;
  conversation_id: string;
  trashed_at: string;
  auto_delete_at: string | null;
  conversation?: {
    id: string;
    name: string | null;
    is_group: boolean;
    avatar_url: string | null;
    members?: Array<{
      user_id: string;
      profile: {
        id: string;
        username: string | null;
        avatar_url: string | null;
        display_name: string | null;
      } | null;
    }>;
  };
}

async function enrichTrashedRows(
  rows: TrashedConversation[], guard: () => void,
): Promise<TrashedConversation[]> {
  guard(); if (!rows.length) return rows;

  const conversationIds = [...new Set(rows.map((row) => row.conversation_id).filter(Boolean))];
  const [conversationResults, membersResult] = await Promise.all([
    Promise.all(
      conversationIds.map(async (conversationId) => {
        guard();
        const { data } = await db
          .from('conversations')
          .select('id, name, is_group, avatar_url')
          .eq('id', conversationId)
          .maybeSingle();
        guard(); return data as TrashedConversation['conversation'] | null;
      }),
    ),
    conversationIds.length
      ? db
          .from('conversation_members')
          .select('conversation_id, user_id')
          .in('conversation_id', conversationIds)
      : Promise.resolve({ data: [] as Array<{ conversation_id: string; user_id: string }> }),
  ]);

  guard();
  const conversationById = new Map<string, NonNullable<TrashedConversation['conversation']>>();
  conversationResults.forEach((conv) => {
    if (conv?.id) conversationById.set(conv.id, conv);
  });

  const membersByConv = new Map<string, Array<{ user_id: string }>>();
  (membersResult.data || []).forEach((member) => {
    const cid = String(member.conversation_id);
    const list = membersByConv.get(cid) || [];
    list.push({ user_id: String(member.user_id) });
    membersByConv.set(cid, list);
  });

  const profileIds: string[] = [
    ...new Set(
      (membersResult.data || [])
        .map((member) => String(member.user_id))
        .filter(Boolean),
    ),
  ] as string[];
  const profiles = profileIds.length ? await fetchMemberProfiles(profileIds, guard) : new Map();

  guard();
  return rows.map((row) => {
    const base = conversationById.get(row.conversation_id);
    if (!base) return row;

    const memberRows = membersByConv.get(row.conversation_id) || [];
    const members = memberRows.map((member) => ({
      user_id: member.user_id,
      profile: profiles.get(member.user_id) || null,
    }));

    return {
      ...row,
      conversation: {
        ...base,
        members,
      },
    };
  });
}

function sortTrashedRows(rows: TrashedConversation[]): TrashedConversation[] {
  return [...rows].sort(
    (a, b) => new Date(b.trashed_at).getTime() - new Date(a.trashed_at).getTime(),
  );
}

export function useTrashedConversations() {
  const scope = useDmActorScope();
  return useQuery({
    queryKey: ['trashed-conversations', scope.profileId, scope.session.uid, scope.session.epoch], enabled: scope.ready,
    queryFn: async ({ signal }) => {
      const actor = scope.capture(); const guard = () => { actor.guard(); if (signal.aborted) throw new DOMException('Read interrupted', 'AbortError'); };
      guard(); const { data, error } = await db.from('trashed_conversations').select('*').eq('user_id', actor.profileId);
      guard(); if (error) throw error;
      if (data?.some(row => row.user_id !== actor.profileId)) throw new Error('Trash access could not be confirmed.');
      // A saved trash row is not permission to restore an old conversation
      // snapshot. Only current parent reads may supply its display details.
      const rows = (data || []).map(({ conversation: _legacy, ...row }) => row) as TrashedConversation[];
      return enrichTrashedRows(sortTrashedRows(rows), guard);
    }, staleTime: 5000,
  });
}

function useTrashAction(action: 'trash' | 'restore' | 'hide') {
  const client = useQueryClient();
  const refresh = (actor: DmActor) => {
    invalidateConversationCaches(client, actor.profileId, actor.session);
    for (const name of ['trashed-conversations', 'trashed-conversation-ids', 'hidden-conversations']) void client.invalidateQueries({ queryKey: dmPrivateKey(name, actor), exact: true });
  };
  return useDmAccountMutation({
    capture: (conversationId: string) => conversationId,
    mutationFn: async ({ value: conversationId, actor }) => {
      actor.guard();
      if (action === 'trash') {
        const hidden = await db.from('hidden_conversations').delete().eq('user_id', actor.profileId).eq('conversation_id', conversationId);
        actor.guard(); if (hidden.error) throw hidden.error;
        const result = await db.from('trashed_conversations').upsert({ user_id: actor.profileId, conversation_id: conversationId,
          trashed_at: new Date().toISOString(), auto_delete_at: new Date(Date.now() + 30 * 86400000).toISOString() }, { onConflict: 'user_id,conversation_id' });
        actor.guard(); if (result.error) throw result.error;
      } else {
        const result = await db.from('trashed_conversations').delete().eq('user_id', actor.profileId).eq('conversation_id', conversationId);
        actor.guard(); if (result.error) throw result.error;
        if (action === 'hide') {
          const hidden = await db.from('hidden_conversations').upsert({ user_id: actor.profileId, conversation_id: conversationId }, { onConflict: 'user_id,conversation_id' });
          actor.guard(); if (hidden.error) throw hidden.error;
        }
      }
      return conversationId;
    },
    onMutate: async ({ value: conversationId, actor }) => {
      const idsKey = dmPrivateKey('trashed-conversation-ids', actor), trashKey = dmPrivateKey('trashed-conversations', actor);
      for (const key of [idsKey, trashKey, ...activeDmListKeys(actor.profileId, actor.session)]) {
        actor.guard(); await client.cancelQueries({ queryKey: key, exact: true }); actor.guard();
      }
      const inbox = snapshotDmInbox(client, actor.profileId, actor.session, conversationId);
      const beforeIds = client.getQueryData(idsKey), beforeTrash = client.getQueryData(trashKey);
      const cached = activeDmListKeys(actor.profileId, actor.session).flatMap(key => client.getQueryData<LoadedDMConversation[]>(key) || []).find(row => row.id === conversationId && isDmConversationForViewer(row, actor.profileId, actor.uid));
      client.setQueryData<Set<string>>(idsKey, old => { const next = new Set(old || []); if (action === 'trash') next.add(conversationId); else next.delete(conversationId); return next; });
      client.setQueryData<TrashedConversation[]>(trashKey, old => {
        const next = (old || []).filter(row => row.conversation_id !== conversationId);
        if (action !== 'trash') return next;
        const row: TrashedConversation = { id: `${actor.profileId}_${conversationId}`, user_id: actor.profileId, conversation_id: conversationId,
          trashed_at: new Date().toISOString(), auto_delete_at: new Date(Date.now() + 30 * 86400000).toISOString(),
          conversation: cached ? { id: cached.id, name: cached.name, is_group: cached.is_group, avatar_url: cached.avatar_url,
            members: safeDmMembers(cached.members).map(member => ({ user_id: member.user_id, profile: member.profile ? { id: member.profile.id,
              username: member.profile.username, avatar_url: member.profile.avatar_url, display_name: member.profile.display_name } : null })) } : undefined };
        return sortTrashedRows([row, ...next]);
      });
      if (action !== 'restore') patchConversationListCaches<LoadedDMConversation>(client, actor.profileId, old => old?.filter(row => row.id !== conversationId), actor.session);
      inbox.capture(); const afterIds = client.getQueryData(idsKey), afterTrash = client.getQueryData(trashKey);
      return { restore: () => {
        inbox.restore();
        for (const [key, before, after] of [[idsKey, beforeIds, afterIds], [trashKey, beforeTrash, afterTrash]] as const) {
          if (client.getQueryData(key) !== after) continue;
          if (before === undefined) client.removeQueries({ queryKey: key, exact: true }); else client.setQueryData(key, before);
        }
      } };
    },
    onSuccess: (_data, { actor }) => { refresh(actor); toast.success(action === 'trash' ? 'Chat moved to trash' : action === 'restore' ? 'Chat restored' : 'Chat permanently deleted'); },
    onError: (_error, { actor }, restore) => { restore?.restore(); refresh(actor); toast.error(action === 'restore' ? 'Could not restore chat' : 'Could not remove chat'); },
  });
}
export const useTrashConversation = () => useTrashAction('trash');
export const useRestoreConversation = () => useTrashAction('restore');
export const usePermanentlyDeleteConversation = () => useTrashAction('hide');

export function useTrashedConversationIds() {
  const scope = useDmActorScope();
  const query = useQuery({
    queryKey: ['trashed-conversation-ids', scope.profileId, scope.session.uid, scope.session.epoch], enabled: scope.ready,
    queryFn: async ({ signal }) => {
      const actor = scope.capture(); actor.guard(); if (signal.aborted) throw new DOMException('Read interrupted', 'AbortError');
      const { data, error } = await db.from('trashed_conversations').select('conversation_id').eq('user_id', actor.profileId);
      actor.guard(); if (signal.aborted) throw new DOMException('Read interrupted', 'AbortError'); if (error) throw error;
      return new Set<string>(data?.map(row => row.conversation_id) || []);
    }, staleTime: 30000, select: normalizePersistedSet,
  });
  return { ...query, data: normalizePersistedSet(query.data) };
}
