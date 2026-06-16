import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  id: string;
  conversation_id: string;
  user_id: string;
  role: GroupRole;
  nickname: string | null;
  is_muted: boolean;
  joined_at: string;
  invited_by: string | null;
  profile?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface CreateGroupParams {
  name: string;
  description?: string;
  avatar_url?: string;
  member_ids: string[];
}

export function useGroupMembers(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['group-members', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      const { data, error } = await db
        .from('group_members')
        .select(`
          *,
          profile:profiles!group_members_user_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .order('role', { ascending: true });
      
      if (error) throw error;
      return (data || []) as unknown as GroupMember[];
    },
    enabled: !!conversationId,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateGroupParams) => {
      const { data: { session } } = await db.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Must be logged in');
      }

      // Build clean payload
      const payload = {
        name: params.name.trim(),
        memberIds: params.member_ids.filter(id => id && typeof id === 'string'),
      };

      console.log('[useCreateGroup] sending payload:', payload);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-group`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      console.log('[useCreateGroup] response:', data);

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to create group');
      }

      return { id: data.id, name: data.name };
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient);
      toast.success('Group created!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create group');
      console.error('Create group error:', error);
    },
  });
}

export function useAddGroupMember() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (!profile?.id) throw new Error('Must be logged in');

      const { error } = await db
        .from('group_members')
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          role: 'member' as GroupRole,
          invited_by: profile.id,
        });

      if (error) throw error;

      // Also add to conversation_members
      await db
        .from('conversation_members')
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          role: 'member',
        });
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', conversationId] });
      toast.success('Member added');
    },
    onError: () => {
      toast.error('Failed to add member');
    },
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const { error } = await db
        .from('group_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      if (error) throw error;

      // Also remove from conversation_members
      await db
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', conversationId] });
      toast.success('Member removed');
    },
    onError: () => {
      toast.error('Failed to remove member');
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id) throw new Error('Must be logged in');

      const { error } = await db
        .from('group_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);

      if (error) throw error;

      await db
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient);
      toast.success('Left group');
    },
    onError: () => {
      toast.error('Failed to leave group');
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      conversationId, 
      userId, 
      role 
    }: { 
      conversationId: string; 
      userId: string; 
      role: GroupRole;
    }) => {
      const { error } = await db
        .from('group_members')
        .update({ role })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', conversationId] });
      toast.success('Role updated');
    },
    onError: () => {
      toast.error('Failed to update role');
    },
  });
}

export function useUpdateGroupSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      conversationId, 
      name, 
      avatar_url, 
      description 
    }: { 
      conversationId: string; 
      name?: string; 
      avatar_url?: string;
      description?: string;
    }) => {
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (avatar_url !== undefined) updates.avatar_url = avatar_url;
      if (description !== undefined) updates.description = description;

      const { error } = await db
        .from('conversations')
        .update(updates as never)
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: (_, { conversationId }) => {
      invalidateConversationCaches(queryClient);
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      toast.success('Group updated');
    },
    onError: () => {
      toast.error('Failed to update group');
    },
  });
}

export function useMyGroupRole(conversationId: string | undefined) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['my-group-role', conversationId, profile?.id],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return null;
      
      const { data, error } = await db
        .from('group_members')
        .select('role')
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id)
        .maybeSingle();
      
      if (error) throw error;
      return data?.role as GroupRole | null;
    },
    enabled: !!conversationId && !!profile?.id,
  });
}
