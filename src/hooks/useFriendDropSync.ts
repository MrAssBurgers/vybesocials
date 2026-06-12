import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { getEffectiveProfileId } from '@/lib/profileCache';
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
  const profileId = getEffectiveProfileId(profile?.id);
  const [activeDrop, setActiveDrop] = useState<FriendDrop | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callbacksRef = useRef({ onScanned, onConfirmed, onCompleted });
  
  // Keep callbacks in sync without re-subscribing
  useEffect(() => {
    callbacksRef.current = { onScanned, onConfirmed, onCompleted };
  }, [onScanned, onConfirmed, onCompleted]);

  // Create a new drop session (called by QR owner)
  const createDrop = useCallback(async (): Promise<FriendDrop | null> => {
    if (!profileId) return null;
    
    setIsCreating(true);
    try {
      // Clean up any existing pending drops from this user
      await supabase
        .from('friend_drops')
        .delete()
        .eq('from_user_id', profileId)
        .eq('status', 'pending');

      // Create new drop
      const { data, error } = await supabase
        .from('friend_drops')
        .insert({
          from_user_id: profileId,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      
      console.log('[FriendDropSync] Created drop:', data.id);
      setActiveDrop(data as FriendDrop);
      return data as FriendDrop;
    } catch (error) {
      console.error('[FriendDropSync] Error creating drop:', error);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [profileId]);

  // Scan a drop (called by QR scanner) - returns the scanned drop
  const scanDrop = useCallback(async (dropId: string): Promise<FriendDrop | null> => {
    if (!profileId) return null;
    
    try {
      console.log('[FriendDropSync] Scanning drop:', dropId);
      const { data, error } = await supabase
        .from('friend_drops')
        .update({
          to_user_id: profileId,
          status: 'scanned',
        })
        .eq('id', dropId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;
      
      console.log('[FriendDropSync] Scan successful, drop data:', data);
      setActiveDrop(data as FriendDrop);
      haptics.success();
      return data as FriendDrop;
    } catch (error) {
      console.error('[FriendDropSync] Error scanning drop:', error);
      return null;
    }
  }, [profileId]);

  // Confirm the drop (either party can confirm after scan)
  const confirmDrop = useCallback(async (dropId: string): Promise<boolean> => {
    try {
      console.log('[FriendDropSync] Confirming drop:', dropId);
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
      
      console.log('[FriendDropSync] Confirmed:', data);
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
      console.log('[FriendDropSync] Completing drop:', dropId);
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
      
      console.log('[FriendDropSync] Completed:', data);
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
    if (!enabled || !profileId) return;

    console.log('[FriendDropSync] Setting up realtime subscription for user:', profileId);
    
    const channel = subscribePostgresChannel(
      `friend-drops-${profileId}`,
      [
        {
          event: 'UPDATE',
          table: 'friend_drops',
          filter: `from_user_id=eq.${profileId}`,
          callback: (payload) => {
            const drop = payload.new as FriendDrop;
            if (!drop) return;
            
            console.log('[FriendDropSync] Owner received update:', drop.status, drop);
            setActiveDrop(drop);
            
            if (drop.status === 'scanned') {
              console.log('[FriendDropSync] QR was scanned! Triggering onScanned callback');
              haptics.impact();
              callbacksRef.current.onScanned?.(drop);
            } else if (drop.status === 'confirmed') {
              console.log('[FriendDropSync] Drop confirmed! Triggering onConfirmed callback');
              haptics.success();
              callbacksRef.current.onConfirmed?.(drop);
            } else if (drop.status === 'completed') {
              console.log('[FriendDropSync] Drop completed! Triggering onCompleted callback');
              callbacksRef.current.onCompleted?.(drop);
            }
          },
        },
        {
          event: 'UPDATE',
          table: 'friend_drops',
          filter: `to_user_id=eq.${profileId}`,
          callback: (payload) => {
            const drop = payload.new as FriendDrop;
            if (!drop) return;
            
            console.log('[FriendDropSync] Scanner received update:', drop.status, drop);
            setActiveDrop(drop);
            
            if (drop.status === 'confirmed') {
              console.log('[FriendDropSync] Scanner sees confirm! Triggering onConfirmed callback');
              haptics.success();
              callbacksRef.current.onConfirmed?.(drop);
            } else if (drop.status === 'completed') {
              console.log('[FriendDropSync] Scanner sees complete! Triggering onCompleted callback');
              callbacksRef.current.onCompleted?.(drop);
            }
          },
        },
      ],
      (status) => {
        console.log('[FriendDropSync] Subscription status:', status);
      },
    );

    channelRef.current = channel;

    return () => {
      console.log('[FriendDropSync] Cleaning up subscription');
      removeRealtimeChannel(channel);
      channelRef.current = null;
    };
  }, [enabled, profileId]);

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
