import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Shield, Clock, ChevronLeft, ToggleLeft, ToggleRight, RefreshCw, Locate, Minus, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
      const { data, error } = await (supabase as any)
        .from('user_locations')
        .select('*, profile:profiles(username, display_name, avatar_url)')
        .eq('sharing_enabled', true);
      if (error) throw error;
      return (data || []) as FriendLocation[];
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
      const { data } = await (supabase as any)
        .from('user_locations')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!user,
  });
}

// Create custom avatar marker icon
function createAvatarIcon(avatarUrl: string | null, name: string) {
  const initial = (name || '?')[0].toUpperCase();
  const bgColor = avatarUrl ? 'transparent' : '#8B5CF6';
  
  return L.divIcon({
    className: 'custom-avatar-marker',
    html: `
      <div style="
        width: 48px; height: 48px; border-radius: 50%;
        border: 3px solid #8B5CF6;
        box-shadow: 0 2px 12px rgba(139,92,246,0.5), 0 0 0 2px rgba(0,0,0,0.2);
        overflow: hidden; background: ${bgColor};
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; color: white; font-size: 18px;
      ">
        ${avatarUrl 
          ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;" />`
          : initial
        }
      </div>
      <div style="
        position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%);
        width: 12px; height: 12px; background: #22C55E;
        border-radius: 50%; border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [48, 56],
    iconAnchor: [24, 56],
    popupAnchor: [0, -56],
  });
}

// My location blue dot
function createMyLocationIcon() {
  return L.divIcon({
    className: 'my-location-marker',
    html: `
      <div style="
        width: 20px; height: 20px; border-radius: 50%;
        background: #3B82F6; border: 3px solid white;
        box-shadow: 0 0 12px rgba(59,130,246,0.6), 0 2px 8px rgba(0,0,0,0.3);
      "></div>
      <div style="
        position: absolute; top: -6px; left: -6px;
        width: 32px; height: 32px; border-radius: 50%;
        background: rgba(59,130,246,0.15);
        animation: pulse-ring 2s infinite;
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Component to fly to location
function FlyToLocation({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center[0], center[1], zoom]);
  return null;
}

export default function FriendMap() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: friends = [], isLoading } = useFriendLocations();
  const { data: myLocation } = useMyLocation();
  const [updating, setUpdating] = useState(false);
  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]);
  const [mapZoom, setMapZoom] = useState(4);
  const [selectedFriend, setSelectedFriend] = useState<FriendLocation | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  // Get user's real location for the blue dot
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyCoords(coords);
        setMapCenter(coords);
        setMapZoom(13);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const isSharingEnabled = myLocation?.sharing_enabled === true;
  const otherFriends = friends.filter(f => f.user_id !== user?.id);

  const toggleSharing = useMutation({
    mutationFn: async (enable: boolean) => {
      if (!user) throw new Error('Not logged in');
      if (enable) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
        });
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        const { error } = await (supabase as any)
          .from('user_locations')
          .upsert({
            user_id: user.id,
            latitude: lat,
            longitude: lng,
            accuracy: pos.coords.accuracy,
            sharing_enabled: true,
            expires_at: expiresAt,
          }, { onConflict: 'user_id' });
        if (error) throw error;
        setMyCoords([lat, lng]);
      } else {
        const { error } = await (supabase as any)
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
      toast.success(enable ? 'Location sharing on 📍' : 'Location sharing off');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update location');
    },
  });

  const recenterOnMe = useCallback(() => {
    if (myCoords) {
      setMapCenter(myCoords);
      setMapZoom(15);
      triggerHaptic('light');
    }
  }, [myCoords]);

  const focusFriend = useCallback((friend: FriendLocation) => {
    setSelectedFriend(friend);
    setMapCenter([friend.latitude, friend.longitude]);
    setMapZoom(16);
    setShowPanel(false);
    triggerHaptic('light');
  }, []);

  return (
    <AppLayout hideNav noPadding>
      <div className="relative w-full h-full">
        {/* Inject pulse animation CSS */}
        <style>{`
          @keyframes pulse-ring {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(2.5); opacity: 0; }
          }
          .custom-avatar-marker, .my-location-marker {
            background: transparent !important;
            border: none !important;
          }
          .leaflet-popup-content-wrapper {
            border-radius: 16px !important;
            padding: 0 !important;
            overflow: hidden !important;
            box-shadow: 0 8px 30px rgba(0,0,0,0.3) !important;
          }
          .leaflet-popup-content { margin: 0 !important; }
          .leaflet-popup-tip { display: none !important; }
          .leaflet-control-zoom { display: none !important; }
          .leaflet-control-attribution { display: none !important; }
        `}</style>

        {/* Map */}
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          className="w-full h-full"
          zoomControl={false}
          attributionControl={false}
          style={{ background: '#1a1a2e' }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          {/* Labels overlay */}
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          <FlyToLocation center={mapCenter} zoom={mapZoom} />

          {/* My location blue dot */}
          {myCoords && (
            <Marker position={myCoords} icon={createMyLocationIcon()} />
          )}

          {/* Friend markers */}
          {otherFriends.map((friend) => (
            <Marker
              key={friend.id}
              position={[friend.latitude, friend.longitude]}
              icon={createAvatarIcon(friend.profile?.avatar_url || null, friend.profile?.display_name || friend.profile?.username || '?')}
              eventHandlers={{
                click: () => {
                  setSelectedFriend(friend);
                  triggerHaptic('light');
                },
              }}
            >
              <Popup>
                <div className="p-3 min-w-[180px]" style={{ background: '#1a1a2e', color: 'white' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-full overflow-hidden bg-purple-500/30 flex items-center justify-center">
                      {friend.profile?.avatar_url ? (
                        <img src={friend.profile.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-white">{(friend.profile?.display_name || '?')[0]}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{friend.profile?.display_name || friend.profile?.username}</p>
                      <p className="text-[10px] opacity-60">@{friend.profile?.username}</p>
                    </div>
                  </div>
                  <p className="text-[10px] opacity-50 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDistanceToNow(new Date(friend.updated_at), { addSuffix: true })}
                  </p>
                  <button
                    onClick={() => navigate(`/u/${friend.profile?.username}`)}
                    className="mt-2 w-full text-xs py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold transition-colors"
                  >
                    View Profile
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Top bar overlay */}
        <div className="absolute top-0 left-0 right-0 z-[1000] safe-area-top">
          <div className="flex items-center gap-3 px-4 pt-3 pb-2">
            <button
              onClick={() => navigate(-1)}
              className="h-10 w-10 rounded-full bg-black/50 backdrop-blur-xl flex items-center justify-center border border-white/10"
            >
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <div className="flex-1">
              <h1 className="text-base font-bold text-white drop-shadow-lg">Friend Map</h1>
              <p className="text-[10px] text-white/60">{otherFriends.length} friend{otherFriends.length !== 1 ? 's' : ''} nearby</p>
            </div>
            <button
              onClick={recenterOnMe}
              className="h-10 w-10 rounded-full bg-black/50 backdrop-blur-xl flex items-center justify-center border border-white/10"
            >
              <Locate className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 z-[1000] safe-area-bottom px-4 pb-6 space-y-3">
          {/* Sharing toggle pill */}
          <motion.button
            onClick={() => toggleSharing.mutate(!isSharingEnabled)}
            disabled={toggleSharing.isPending}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-2xl backdrop-blur-xl border transition-all shadow-lg",
              isSharingEnabled
                ? "bg-emerald-500/20 border-emerald-400/30"
                : "bg-black/50 border-white/10"
            )}
          >
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center",
              isSharingEnabled ? "bg-emerald-500/30" : "bg-white/10"
            )}>
              <Shield className={cn("h-4 w-4", isSharingEnabled ? "text-emerald-400" : "text-white/60")} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-white">
                {isSharingEnabled ? 'Sharing On' : 'Share My Location'}
              </p>
              <p className="text-[10px] text-white/50">
                {isSharingEnabled ? 'Friends can see you · Expires in 8h' : 'Let friends find you on the map'}
              </p>
            </div>
            {isSharingEnabled ? (
              <ToggleRight className="h-6 w-6 text-emerald-400" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-white/40" />
            )}
          </motion.button>

          {/* Friend chips row */}
          {otherFriends.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {otherFriends.map((friend) => (
                <motion.button
                  key={friend.id}
                  onClick={() => focusFriend(friend)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-xl border shrink-0 transition-all",
                    selectedFriend?.id === friend.id
                      ? "bg-primary/30 border-primary/50"
                      : "bg-black/50 border-white/10"
                  )}
                >
                  <div className="h-7 w-7 rounded-full overflow-hidden bg-primary/30 flex items-center justify-center">
                    {friend.profile?.avatar_url ? (
                      <img src={friend.profile.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold text-white">{(friend.profile?.display_name || '?')[0]}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-white whitespace-nowrap">
                    {friend.profile?.display_name || friend.profile?.username || 'Friend'}
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
