/**
 * useConversationSafety — manages AI safety filter overrides per conversation.
 * Supports DMs (2 users) and group chats (all members must accept).
 * Users 12 and under cannot disable the filter.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useEffect, useCallback, useMemo } from 'react';

interface SafetyOverride {
  id: string;
  conversation_id: string;
  requested_by: string;
  status: string;
  created_at: string;
  responded_at: string | null;
}

interface SafetyResponse {
  id: string;
  override_id: string;
  user_id: string;
  response: string;
  created_at: string;
}

/**
 * Calculate user age from date_of_birth
 */
function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function useConversationSafety(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Get user's age via the sensitive profile RPC
  const { data: userAge } = useQuery({
    queryKey: ['user-age', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_own_sensitive_profile');
      if (error || !data) return null;
      const dob = (data as any).date_of_birth;
      if (!dob) return null;
      return calculateAge(dob);
    },
    enabled: !!profile?.id,
    staleTime: Infinity,
  });

  const isUnder13 = userAge !== null && userAge !== undefined && userAge <= 12;
  const isUnder18 = userAge !== null && userAge !== undefined && userAge < 18;

  // Get active safety override for this conversation
  const { data: activeOverride, refetch: refetchOverride } = useQuery({
    queryKey: ['safety-override', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from('conversation_safety_overrides')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', ['pending', 'accepted'])
        .maybeSingle();
      if (error) {
        console.error('[Safety] Override query error:', error);
        return null;
      }
      return data as SafetyOverride | null;
    },
    enabled: !!conversationId && !!profile?.id,
  });

  // Get responses for group chats
  const { data: responses } = useQuery({
    queryKey: ['safety-responses', activeOverride?.id],
    queryFn: async () => {
      if (!activeOverride?.id) return [];
      const { data, error } = await supabase
        .from('conversation_safety_responses')
        .select('*')
        .eq('override_id', activeOverride.id);
      if (error) return [];
      return (data || []) as SafetyResponse[];
    },
    enabled: !!activeOverride?.id,
  });

  // Is the safety filter currently disabled for this conversation?
  const isSafetyDisabled = activeOverride?.status === 'accepted';

  // Is there a pending request?
  const hasPendingRequest = activeOverride?.status === 'pending';

  // Has the current user already responded?
  const hasCurrentUserResponded = useMemo(() => {
    if (!responses || !profile?.id) return false;
    return responses.some(r => r.user_id === profile.id);
  }, [responses, profile?.id]);

  // Did current user make the request?
  const isRequester = activeOverride?.requested_by === profile?.id;

  // Subscribe to realtime changes
  useEffect(() => {
    if (!conversationId) return;

    const channel = subscribePostgresChannel(`safety-override:${conversationId}`, [
      {
        event: '*',
        table: 'conversation_safety_overrides',
        filter: `conversation_id=eq.${conversationId}`,
        callback: () => {
          refetchOverride();
        },
      },
      {
        event: '*',
        table: 'conversation_safety_responses',
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['safety-responses'] });
        },
      },
    ]);

    return () => { removeRealtimeChannel(channel); };
  }, [conversationId, refetchOverride, queryClient]);

  // Request to disable AI filter
  const requestDisable = useMutation({
    mutationFn: async () => {
      if (!conversationId || !profile?.id) throw new Error('Not ready');
      if (isUnder13) throw new Error('Users 12 and under must keep AI filters on');

      const { data, error } = await supabase
        .from('conversation_safety_overrides')
        .insert({
          conversation_id: conversationId,
          requested_by: profile.id,
          status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      refetchOverride();
      toast.success('AI filter disable request sent');
    },
    onError: (err: Error) => {
      if (err.message.includes('12 and under')) {
        toast.error('AI filters cannot be disabled for your age group');
      } else if (err.message.includes('duplicate') || err.message.includes('unique')) {
        toast('A request is already pending');
      } else {
        toast.error('Failed to send request');
      }
    },
  });

  // Respond to a request (accept/decline)
  const respondToRequest = useMutation({
    mutationFn: async (response: 'accepted' | 'declined') => {
      if (!activeOverride?.id || !profile?.id) throw new Error('No active request');
      if (isUnder13 && response === 'accepted') throw new Error('Users 12 and under must keep AI filters on');

      // Insert response
      const { error: responseError } = await supabase
        .from('conversation_safety_responses')
        .insert({
          override_id: activeOverride.id,
          user_id: profile.id,
          response,
        });
      if (responseError) throw responseError;

      // For DMs (2 users), if accepted, mark the override as accepted
      // For groups, we check if everyone accepted below
      if (response === 'declined') {
        await supabase
          .from('conversation_safety_overrides')
          .update({ status: 'declined', responded_at: new Date().toISOString() })
          .eq('id', activeOverride.id);
      } else {
        // Check if all other members have accepted (for group chats)
        // For DMs this is sufficient since only 2 members
        const { data: members } = await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', activeOverride.conversation_id);

        const memberIds = (members || []).map(m => m.user_id).filter(id => id !== activeOverride.requested_by);
        
        const { data: allResponses } = await supabase
          .from('conversation_safety_responses')
          .select('*')
          .eq('override_id', activeOverride.id);

        const acceptedIds = new Set((allResponses || []).filter(r => r.response === 'accepted').map(r => r.user_id));
        // Add current user's acceptance
        acceptedIds.add(profile.id);
        
        const allAccepted = memberIds.every(id => acceptedIds.has(id));
        
        if (allAccepted) {
          await supabase
            .from('conversation_safety_overrides')
            .update({ status: 'accepted', responded_at: new Date().toISOString() })
            .eq('id', activeOverride.id);
        }
      }
    },
    onSuccess: (_, response) => {
      refetchOverride();
      queryClient.invalidateQueries({ queryKey: ['safety-responses'] });
      toast.success(response === 'accepted' ? 'AI filter disabled for this chat' : 'Request declined');
    },
    onError: (err: Error) => {
      if (err.message.includes('12 and under')) {
        toast.error('AI filters cannot be disabled for your age group');
      } else {
        toast.error('Failed to respond');
      }
    },
  });

  // Re-enable AI filter (cancel the override)
  const reEnable = useMutation({
    mutationFn: async () => {
      if (!activeOverride?.id) throw new Error('No active override');
      await supabase
        .from('conversation_safety_overrides')
        .update({ status: 'cancelled', responded_at: new Date().toISOString() })
        .eq('id', activeOverride.id);
    },
    onSuccess: () => {
      refetchOverride();
      toast.success('AI filters re-enabled');
    },
  });

  return {
    isSafetyDisabled,
    hasPendingRequest,
    hasCurrentUserResponded,
    isRequester,
    isUnder13,
    isUnder18,
    userAge,
    activeOverride,
    responses,
    requestDisable,
    respondToRequest,
    reEnable,
  };
}
