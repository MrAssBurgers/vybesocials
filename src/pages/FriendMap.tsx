import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Shield, Clock, ChevronLeft, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface FriendLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  label: string | null;
  updated_at: string;
  profile?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

function useFriendLocations() {
  return useQuery({
    queryKey: ['friend-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_locations')
        .select('*, profile:profiles!user_locations_user_id_fkey(username, display_name, avatar_url)')
        .eq('sharing_enabled', true);
      if (error) throw error;
      return (data || []) as unknown as FriendLocation[];
    },
    refetchInterval: 30000,
  });
}

function useMyLocation() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-location'],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('user_locations')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });
}

// Simple grid-based map visualization
const MapGrid = memo(function MapGrid({ friends, myLocation }: { friends: FriendLocation[]; myLocation: any }) {
  const navigate = useNavigate();
  
  if (friends.length === 0 && !myLocation?.sharing_enabled) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <MapPin className="h-10 w-10 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground">No Friends Sharing</h3>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Enable location sharing to see where your friends are, and they'll see you too!
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
      {friends.map((friend, i) => (
        <motion.button
          key={friend.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => {
            triggerHaptic('light');
            if (friend.profile?.username) navigate(`/u/${friend.profile.username}`);
          }}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card/60 border border-border/30 hover:bg-card/80 transition-all active:scale-[0.98]"
        >
          <div className="relative">
            <Avatar className="h-11 w-11">
              <AvatarImage src={friend.profile?.avatar_url || ''} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                {(friend.profile?.display_name || '?')[0]}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
              <MapPin className="h-2 w-2 text-white" />
            </div>
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {friend.profile?.display_name || friend.profile?.username || 'Unknown'}
            </p>
            <div className="flex items-center gap-1.5">
              {friend.label && (
                <span className="text-xs text-primary font-medium truncate">{friend.label}</span>
              )}
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {formatDistanceToNow(new Date(friend.updated_at), { addSuffix: true })}
              </span>
            </div>
          </div>
          <Navigation className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </motion.button>
      ))}
    </div>
  );
});

export default function FriendMap() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: friends = [], isLoading } = useFriendLocations();
  const { data: myLocation } = useMyLocation();
  const [updating, setUpdating] = useState(false);

  const toggleSharing = useMutation({
    mutationFn: async (enable: boolean) => {
      if (!user) throw new Error('Not logged in');
      
      if (enable) {
        // Get current location
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
          });
        });
        
        // Fuzzy location (~1km precision)
        const lat = Math.round(pos.coords.latitude * 100) / 100;
        const lng = Math.round(pos.coords.longitude * 100) / 100;
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        
        const { error } = await supabase
          .from('user_locations')
          .upsert({
            user_id: user.id,
            latitude: lat,
            longitude: lng,
            accuracy: 1000,
            sharing_enabled: true,
            expires_at: expiresAt,
          }, { onConflict: 'user_id' });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_locations')
          .update({ sharing_enabled: false })
          .eq('user_id', user.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, enable) => {
      queryClient.invalidateQueries({ queryKey: ['my-location'] });
      queryClient.invalidateQueries({ queryKey: ['friend-locations'] });
      triggerHaptic('medium');
      toast.success(enable ? 'Location sharing enabled' : 'Location sharing disabled');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update location');
    },
  });

  const refreshLocation = useCallback(async () => {
    if (!user) return;
    setUpdating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000 });
      });
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lng = Math.round(pos.coords.longitude * 100) / 100;
      await supabase
        .from('user_locations')
        .update({ latitude: lat, longitude: lng, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      queryClient.invalidateQueries({ queryKey: ['friend-locations'] });
      triggerHaptic('light');
      toast.success('Location updated');
    } catch {
      toast.error('Could not get location');
    } finally {
      setUpdating(false);
    }
  }, [user, queryClient]);

  const isSharingEnabled = myLocation?.sharing_enabled === true;
  const otherFriends = friends.filter(f => f.user_id !== user?.id);

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-[80vh]">
        {/* Header */}
        <div className="px-4 pt-2 pb-3 space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-muted/50 transition-colors">
              <ChevronLeft className="h-5 w-5 text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground">Friend Map</h1>
              <p className="text-xs text-muted-foreground">{otherFriends.length} friend{otherFriends.length !== 1 ? 's' : ''} sharing</p>
            </div>
            {isSharingEnabled && (
              <button
                onClick={refreshLocation}
                disabled={updating}
                className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <RefreshCw className={cn("h-4 w-4", updating && "animate-spin")} />
              </button>
            )}
          </div>

          {/* Sharing toggle */}
          <button
            onClick={() => toggleSharing.mutate(!isSharingEnabled)}
            disabled={toggleSharing.isPending}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-2xl border transition-all",
              isSharingEnabled
                ? "bg-primary/10 border-primary/30"
                : "bg-muted/30 border-border/30"
            )}
          >
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center",
              isSharingEnabled ? "bg-primary/20" : "bg-muted/50"
            )}>
              <Shield className={cn("h-4.5 w-4.5", isSharingEnabled ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-foreground">
                {isSharingEnabled ? 'Sharing your location' : 'Location sharing off'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isSharingEnabled ? 'Approximate location · Expires in 8h' : 'Only friends can see your location'}
              </p>
            </div>
            {isSharingEnabled ? (
              <ToggleRight className="h-6 w-6 text-primary" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Friends list */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <MapGrid friends={otherFriends} myLocation={myLocation} />
        )}
      </div>
    </AppLayout>
  );
}
