import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { 
  isNativeFriendDropAvailable, 
  NativeFriendDropService,
  type NearbyUser 
} from '@/lib/nativeFriendDrop';
import { haptics } from '@/lib/haptics';

interface UseNativeFriendDropOptions {
  enabled?: boolean;
  onPeerFound?: (peer: NearbyUser) => void;
  onPeerConnected?: (peer: NearbyUser) => void;
}

interface UseNativeFriendDropResult {
  isAvailable: boolean;
  isActive: boolean;
  nearbyPeers: NearbyUser[];
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  acceptPeer: (peerId: string) => Promise<void>;
}

export function useNativeFriendDrop({
  enabled = true,
  onPeerFound,
  onPeerConnected,
}: UseNativeFriendDropOptions = {}): UseNativeFriendDropResult {
  const { user, profile } = useAuth();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [nearbyPeers, setNearbyPeers] = useState<NearbyUser[]>([]);
  const serviceRef = useRef<NativeFriendDropService | null>(null);
  
  // Check availability on mount
  useEffect(() => {
    isNativeFriendDropAvailable().then(setIsAvailable);
  }, []);
  
  // Start FriendDrop session
  const startSession = useCallback(async () => {
    if (!isAvailable || !user || !profile?.username) return;
    
    try {
      const service = new NativeFriendDropService();
      serviceRef.current = service;
      
      // Set up event listeners
      await service.onPeerFound((peer) => {
        haptics.impact();
        setNearbyPeers(prev => {
          // Avoid duplicates
          if (prev.some(p => p.peerId === peer.peerId)) return prev;
          return [...prev, peer];
        });
        onPeerFound?.(peer);
      });
      
      await service.onPeerLost((peerId) => {
        setNearbyPeers(prev => prev.filter(p => p.peerId !== peerId));
      });
      
      await service.onPeerConnected((peer) => {
        haptics.success();
        onPeerConnected?.(peer);
      });
      
      // Start the session
      await service.startSession({
        userId: user.id,
        username: profile.username,
        displayName: (profile as any).display_name || null,
        avatarUrl: profile.avatar_url || null,
      });
      
      setIsActive(true);
    } catch (error) {
      console.error('Failed to start FriendDrop session:', error);
    }
  }, [isAvailable, user, profile, onPeerFound, onPeerConnected]);
  
  // Stop FriendDrop session
  const stopSession = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.cleanup();
      serviceRef.current = null;
    }
    setIsActive(false);
    setNearbyPeers([]);
  }, []);
  
  // Accept a peer connection
  const acceptPeer = useCallback(async (peerId: string) => {
    if (serviceRef.current) {
      await serviceRef.current.acceptPeer(peerId);
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.cleanup();
      }
    };
  }, []);
  
  return {
    isAvailable,
    isActive,
    nearbyPeers,
    startSession,
    stopSession,
    acceptPeer,
  };
}
