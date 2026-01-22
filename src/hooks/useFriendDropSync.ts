import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { haptics } from '@/lib/haptics';

export interface FriendDrop {
  id: string;
  from_user_id: string;
  to_user_id: string | null;
  status: 'pending' | 'scanned' | 'confirmed' | 'completed';
  created_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
}

interface UseFriendDropSyncOptions {
  enabled?: boolean;
  onScanned?: (drop: FriendDrop) => void;
  onConfirmed?: (drop: FriendDrop) => void;
  onCompleted?: (drop: FriendDrop) => void;
}

/**
 * Hook for realtime FriendDrop sync between two devices.
 * When QR is scanned, both devices get notified and can play animation together.
 */
export function useFriendDropSync({
  enabled = true,
  onScanned,
  onConfirmed,
  onCompleted,
}: UseFriendDropSyncOptions = {}) {
  const { profile } = useAuth();
  const [activeDrop, setActiveDrop] = useState<FriendDrop | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Create a new drop session (called by QR owner)
  const createDrop = useCallback(async (): Promise<FriendDrop | null> => {
    if (!profile?.id) return null;
    
    setIsCreating(true);
    try {
      // Clean up any existing pending drops from this user
      await supabase
        .from('friend_drops')
        .delete()
        .eq('from_user_id', profile.id)
        .eq('status', 'pending');

      // Create new drop
      const { data, error } = await supabase
        .from('friend_drops')
        .insert({
          from_user_id: profile.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      
      setActiveDrop(data as FriendDrop);
      return data as FriendDrop;
    } catch (error) {
      console.error('[FriendDropSync] Error creating drop:', error);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [profile?.id]);

  // Scan a drop (called by QR scanner)
  const scanDrop = useCallback(async (dropId: string): Promise<boolean> => {
    if (!profile?.id) return false;
    
    try {
      const { data, error } = await supabase
        .from('friend_drops')
        .update({
          to_user_id: profile.id,
          status: 'scanned',
        })
        .eq('id', dropId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;
      
      setActiveDrop(data as FriendDrop);
      haptics.success();
      return true;
    } catch (error) {
      console.error('[FriendDropSync] Error scanning drop:', error);
      return false;
    }
  }, [profile?.id]);

  // Confirm the drop (either party can confirm after scan)
  const confirmDrop = useCallback(async (dropId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('friend_drops')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', dropId)
        .in('status', ['scanned'])
        .select()
        .single();

      if (error) throw error;
      
      setActiveDrop(data as FriendDrop);
      return true;
    } catch (error) {
      console.error('[FriendDropSync] Error confirming drop:', error);
      return false;
    }
  }, []);

  // Complete the drop (after friend request is sent)
  const completeDrop = useCallback(async (dropId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('friend_drops')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', dropId)
        .select()
        .single();

      if (error) throw error;
      
      setActiveDrop(data as FriendDrop);
      return true;
    } catch (error) {
      console.error('[FriendDropSync] Error completing drop:', error);
      return false;
    }
  }, []);

  // Cancel/cleanup drop
  const cancelDrop = useCallback(async (dropId?: string) => {
    const id = dropId || activeDrop?.id;
    if (!id) return;
    
    try {
      await supabase
        .from('friend_drops')
        .delete()
        .eq('id', id);
      
      setActiveDrop(null);
    } catch (error) {
      console.error('[FriendDropSync] Error canceling drop:', error);
    }
  }, [activeDrop?.id]);

  // Subscribe to realtime updates for active drop
  useEffect(() => {
    if (!enabled || !profile?.id) return;

    // Subscribe to drops where user is either party
    const channel = supabase
      .channel(`friend-drops-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_drops',
          filter: `from_user_id=eq.${profile.id}`,
        },
        (payload) => {
          const drop = payload.new as FriendDrop;
          if (!drop) return;
          
          setActiveDrop(drop);
          
          if (drop.status === 'scanned') {
            haptics.impact();
            onScanned?.(drop);
          } else if (drop.status === 'confirmed') {
            haptics.success();
            onConfirmed?.(drop);
          } else if (drop.status === 'completed') {
            onCompleted?.(drop);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_drops',
          filter: `to_user_id=eq.${profile.id}`,
        },
        (payload) => {
          const drop = payload.new as FriendDrop;
          if (!drop) return;
          
          setActiveDrop(drop);
          
          if (drop.status === 'confirmed') {
            haptics.success();
            onConfirmed?.(drop);
          } else if (drop.status === 'completed') {
            onCompleted?.(drop);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [enabled, profile?.id, onScanned, onConfirmed, onCompleted]);

  return {
    activeDrop,
    isCreating,
    createDrop,
    scanDrop,
    confirmDrop,
    completeDrop,
    cancelDrop,
  };
}
