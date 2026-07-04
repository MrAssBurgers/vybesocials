import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';
import { invalidateConversationCaches, patchConversationListCaches } from '@/lib/invalidateConversationCaches';
import { normalizePersistedSet, safeDmMembers } from '@/lib/persistedCollections';
import { fetchMemberProfiles } from '@/lib/dmMembershipRepair';
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
  rows: TrashedConversation[],
): Promise<TrashedConversation[]> {
  if (!rows.length) return rows;

  const conversationIds = [...new Set(rows.map((row) => row.conversation_id).filter(Boolean))];
  const [conversationResults, membersResult] = await Promise.all([
    Promise.all(
      conversationIds.map(async (conversationId) => {
        const { data } = await db
          .from('conversations')
          .select('id, name, is_group, avatar_url')
          .eq('id', conversationId)
          .maybeSingle();
        return data as TrashedConversation['conversation'] | null;
      }),
    ),
    conversationIds.length
      ? db
          .from('conversation_members')
          .select('conversation_id, user_id')
          .in('conversation_id', conversationIds)
      : Promise.resolve({ data: [] as Array<{ conversation_id: string; user_id: string }> }),
  ]);

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

  const profileIds = [
    ...new Set(
      (membersResult.data || [])
        .map((member) => String(member.user_id))
        .filter(Boolean),
    ),
  ];
  const profiles = profileIds.length ? await fetchMemberProfiles(profileIds) : new Map();

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
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['trashed-conversations', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await db
        .from('trashed_conversations')
        .select('*')
        .eq('user_id', profileId);

      if (error) throw error;

      const rows = sortTrashedRows((data || []) as TrashedConversation[]);
      return enrichTrashedRows(rows);
    },
    enabled: !!profileId,
    staleTime: 5000,
  });
}

export function useTrashConversation() {
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId || !user?.id) throw new Error('Not authenticated');

      await db
        .from('hidden_conversations')
        .delete()
        .eq('user_id', profileId)
        .eq('conversation_id', conversationId);

      const { error } = await db
        .from('trashed_conversations')
        .upsert(
          {
            user_id: profileId,
            conversation_id: conversationId,
            trashed_at: new Date().toISOString(),
            auto_delete_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'user_id,conversation_id' },
        );

      if (error) throw error;
      return conversationId;
    },
    onMutate: async (conversationId: string) => {
      if (!profileId) return {};
      await queryClient.cancelQueries({ queryKey: ['trashed-conversation-ids'] });
      await queryClient.cancelQueries({ queryKey: ['trashed-conversations', profileId] });
      await queryClient.cancelQueries({ queryKey: ['dm-conversations', profileId] });

      const previousIds = queryClient.getQueryData<Set<string>>(['trashed-conversation-ids', profileId]);
      const previousDMs = queryClient.getQueryData(['dm-conversations', profileId]);
      const previousTrash = queryClient.getQueryData<TrashedConversation[]>([
        'trashed-conversations',
        profileId,
      ]);

      const cachedConv = readDmConversationFromCache(queryClient, profileId, conversationId);
      const trashedAt = new Date().toISOString();
      const optimisticRow: TrashedConversation = {
        id: `${profileId}_${conversationId}`,
        user_id: profileId,
        conversation_id: conversationId,
        trashed_at: trashedAt,
        auto_delete_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        conversation: cachedConv
          ? {
              id: cachedConv.id,
              name: cachedConv.name,
              is_group: cachedConv.is_group,
              avatar_url: cachedConv.avatar_url,
              members: safeDmMembers(cachedConv.members).map((member) => ({
                user_id: member.user_id,
                profile: member.profile
                  ? {
                      id: member.profile.id,
                      username: member.profile.username,
                      avatar_url: member.profile.avatar_url,
                      display_name: member.profile.display_name,
                    }
                  : null,
              })),
            }
          : undefined,
      };

      queryClient.setQueryData<Set<string>>(['trashed-conversation-ids', profileId], (old) => {
        const newSet = new Set(old || []);
        newSet.add(conversationId);
        return newSet;
      });

      queryClient.setQueryData<TrashedConversation[]>(
        ['trashed-conversations', profileId],
        (old) => {
          const list = (old || []).filter((row) => row.conversation_id !== conversationId);
          return sortTrashedRows([optimisticRow, ...list]);
        },
      );

      patchConversationListCaches(queryClient, profileId, (old) => {
        if (!old) return old;
        return old.filter((conv: { id: string }) => conv.id !== conversationId);
      });

      return { previousIds, previousDMs, previousTrash };
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient, profileId);
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['trashed-conversation-ids'] });
      toast.success('Chat moved to trash');
    },
    onError: (error: any, _conversationId, context) => {
      if (profileId && context?.previousIds) {
        queryClient.setQueryData(['trashed-conversation-ids', profileId], context.previousIds);
      }
      if (profileId && context?.previousDMs) {
        queryClient.setQueryData(['dm-conversations', profileId], context.previousDMs);
        queryClient.setQueryData(['conversations', profileId], context.previousDMs);
      }
      if (profileId && context?.previousTrash) {
        queryClient.setQueryData(['trashed-conversations', profileId], context.previousTrash);
      }
      console.error('Failed to trash conversation:', error);
      toast.error('Failed to delete chat');
    },
  });
}

function readDmConversationFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string,
  conversationId: string,
): LoadedDMConversation | undefined {
  const lists = [
    queryClient.getQueryData<LoadedDMConversation[]>(['dm-conversations', profileId]),
    queryClient.getQueryData<LoadedDMConversation[]>(['conversations', profileId]),
  ];
  for (const list of lists) {
    const hit = list?.find((conv) => conv.id === conversationId);
    if (hit) return hit;
  }
  return undefined;
}

export function useRestoreConversation() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await db
        .from('trashed_conversations')
        .delete()
        .eq('user_id', profileId)
        .eq('conversation_id', conversationId);

      if (error) throw error;
      return conversationId;
    },
    onMutate: async (conversationId: string) => {
      if (!profileId) return {};
      await queryClient.cancelQueries({ queryKey: ['trashed-conversation-ids'] });
      await queryClient.cancelQueries({ queryKey: ['trashed-conversations', profileId] });

      const previousIds = queryClient.getQueryData<Set<string>>(['trashed-conversation-ids', profileId]);
      const previousTrash = queryClient.getQueryData<TrashedConversation[]>([
        'trashed-conversations',
        profileId,
      ]);

      queryClient.setQueryData<Set<string>>(['trashed-conversation-ids', profileId], (old) => {
        const newSet = new Set(old || []);
        newSet.delete(conversationId);
        return newSet;
      });

      queryClient.setQueryData<TrashedConversation[]>(
        ['trashed-conversations', profileId],
        (old) => (old || []).filter((row) => row.conversation_id !== conversationId),
      );

      return { previousIds, previousTrash };
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient, profileId);
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['trashed-conversation-ids'] });
      toast.success('Chat restored');
    },
    onError: (error: any, _conversationId, context) => {
      if (profileId && context?.previousIds) {
        queryClient.setQueryData(['trashed-conversation-ids', profileId], context.previousIds);
      }
      if (profileId && context?.previousTrash) {
        queryClient.setQueryData(['trashed-conversations', profileId], context.previousTrash);
      }
      console.error('Failed to restore conversation:', error);
      toast.error('Failed to restore chat');
    },
  });
}

export function usePermanentlyDeleteConversation() {
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId || !user?.id) throw new Error('Not authenticated');

      const { error: trashError } = await db
        .from('trashed_conversations')
        .delete()
        .eq('user_id', profileId)
        .eq('conversation_id', conversationId);

      if (trashError) throw trashError;

      const { error: hideError } = await db
        .from('hidden_conversations')
        .upsert(
          { user_id: profileId, conversation_id: conversationId },
          { onConflict: 'user_id,conversation_id' },
        );

      if (hideError) throw hideError;
    },
    onMutate: async (conversationId: string) => {
      if (!profileId) return {};
      const previousTrash = queryClient.getQueryData<TrashedConversation[]>([
        'trashed-conversations',
        profileId,
      ]);
      queryClient.setQueryData<TrashedConversation[]>(
        ['trashed-conversations', profileId],
        (old) => (old || []).filter((row) => row.conversation_id !== conversationId),
      );
      return { previousTrash };
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient, profileId);
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      toast.success('Chat permanently deleted');
    },
    onError: (error: any, _conversationId, context) => {
      if (profileId && context?.previousTrash) {
        queryClient.setQueryData(['trashed-conversations', profileId], context.previousTrash);
      }
      console.error('Failed to permanently delete conversation:', error);
      toast.error('Failed to delete chat');
    },
  });
}

export function useTrashedConversationIds() {
  const profileId = useAuthProfileId();

  const query = useQuery({
    queryKey: ['trashed-conversation-ids', profileId],
    queryFn: async () => {
      if (!profileId) return new Set<string>();

      const { data, error } = await db
        .from('trashed_conversations')
        .select('conversation_id')
        .eq('user_id', profileId);

      if (error) throw error;
      return new Set(data?.map(t => t.conversation_id) || []);
    },
    enabled: !!profileId,
    staleTime: 30000,
    select: normalizePersistedSet,
  });

  return {
    ...query,
    data: normalizePersistedSet(query.data),
  };
}
