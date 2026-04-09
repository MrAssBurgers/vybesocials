import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Clock, ChevronLeft, ToggleLeft, ToggleRight, Locate, Minus, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
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

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;
const FRIEND_FOCUS_ZOOM = 15;
const MY_LOCATION_ZOOM = 15;

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

function createAvatarIcon(avatarUrl: string | null, name: string) {
  const initial = (name || '?')[0].toUpperCase();
  const safeAvatarUrl = avatarUrl?.replace(/"/g, '&quot;') ?? null;

  return L.divIcon({
    className: 'friend-map-marker',
    html: `
      <div style="
        width: 52px;
        height: 52px;
        border-radius: 9999px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${safeAvatarUrl ? 'hsl(var(--card))' : 'hsl(var(--primary))'};
        border: 3px solid hsl(var(--background));
        box-shadow: 0 10px 30px hsl(var(--foreground) / 0.25), 0 0 0 3px hsl(var(--background) / 0.35);
        color: hsl(var(--primary-foreground));
        font-weight: 800;
        font-size: 18px;
      ">
        ${safeAvatarUrl
          ? `<img src="${safeAvatarUrl}" alt="${initial}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : initial}
      </div>
      <div style="
        position: absolute;
        bottom: -2px;
        left: 50%;
        transform: translateX(-50%);
        width: 14px;
        height: 14px;
        border-radius: 9999px;
        background: hsl(var(--accent));
        border: 2px solid hsl(var(--background));
        box-shadow: 0 2px 8px hsl(var(--foreground) / 0.2);
      "></div>
    `,
    iconSize: [52, 64],
    iconAnchor: [26, 58],
  });
}

function createMyLocationIcon() {
  return L.divIcon({
    className: 'my-location-marker',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: hsl(var(--primary));
        border: 3px solid hsl(var(--background));
        box-shadow: 0 0 20px hsl(var(--primary) / 0.55), 0 8px 24px hsl(var(--foreground) / 0.18);
      "></div>
      <div style="
        position: absolute;
        inset: -8px;
        border-radius: 9999px;
        background: hsl(var(--primary) / 0.18);
        animation: pulse-ring 2s infinite;
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function FriendMap() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: friends = [], isLoading } = useFriendLocations();
  const { data: myLocation } = useMyLocation();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const friendLayerRef = useRef<L.LayerGroup | null>(null);
  const myMarkerRef = useRef<L.Marker | null>(null);

  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [selectedFriend, setSelectedFriend] = useState<FriendLocation | null>(null);

  const isSharingEnabled = myLocation?.sharing_enabled === true;
  const otherFriends = friends.filter((friend) => friend.user_id !== user?.id);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    ).addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    ).addTo(map);

    friendLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      friendLayerRef.current?.clearLayers();
      friendLayerRef.current = null;
      myMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setMyCoords(coords);
        setMapCenter(coords);
        setMapZoom(13);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.flyTo(mapCenter, mapZoom, { duration: 1.1 });
  }, [mapCenter, mapZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!myCoords) {
      if (myMarkerRef.current) {
        map.removeLayer(myMarkerRef.current);
        myMarkerRef.current = null;
      }
      return;
    }

    if (!myMarkerRef.current) {
      myMarkerRef.current = L.marker(myCoords, {
        icon: createMyLocationIcon(),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
      return;
    }

    myMarkerRef.current.setLatLng(myCoords);
  }, [myCoords]);

  useEffect(() => {
    const layer = friendLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    otherFriends.forEach((friend) => {
      const marker = L.marker([friend.latitude, friend.longitude], {
        icon: createAvatarIcon(
          friend.profile?.avatar_url || null,
          friend.profile?.display_name || friend.profile?.username || '?'
        ),
        riseOnHover: true,
      });

      marker.on('click', () => {
        setSelectedFriend(friend);
        setMapCenter([friend.latitude, friend.longitude]);
        setMapZoom(FRIEND_FOCUS_ZOOM);
        triggerHaptic('light');
      });

      marker.addTo(layer);
    });
  }, [otherFriends]);

  useEffect(() => {
    if (selectedFriend && !otherFriends.some((friend) => friend.id === selectedFriend.id)) {
      setSelectedFriend(null);
    }
  }, [otherFriends, selectedFriend]);

  const toggleSharing = useMutation({
    mutationFn: async (enable: boolean) => {
      if (!user) throw new Error('Not logged in');

      if (enable) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        });

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

        const { error } = await (supabase as any)
          .from('user_locations')
          .upsert(
            {
              user_id: user.id,
              latitude,
              longitude,
              accuracy: position.coords.accuracy,
              sharing_enabled: true,
              expires_at: expiresAt,
            },
            { onConflict: 'user_id' }
          );

        if (error) throw error;

        const coords: [number, number] = [latitude, longitude];
        setMyCoords(coords);
        setMapCenter(coords);
        setMapZoom(MY_LOCATION_ZOOM);
        return enable;
      }

      const { error } = await (supabase as any)
        .from('user_locations')
        .update({ sharing_enabled: false })
        .eq('user_id', user.id);

      if (error) throw error;
      return enable;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['my-location'] });
      queryClient.invalidateQueries({ queryKey: ['friend-locations'] });
      triggerHaptic('medium');
      toast.success(enabled ? 'Location sharing on 📍' : 'Location sharing off');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update location');
    },
  });

  const recenterOnMe = useCallback(() => {
    if (!myCoords) return;
    setMapCenter(myCoords);
    setMapZoom(MY_LOCATION_ZOOM);
    triggerHaptic('light');
  }, [myCoords]);

  const focusFriend = useCallback((friend: FriendLocation) => {
    setSelectedFriend(friend);
    setMapCenter([friend.latitude, friend.longitude]);
    setMapZoom(FRIEND_FOCUS_ZOOM);
    triggerHaptic('light');
  }, []);

  const zoomIn = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setMapCenter([map.getCenter().lat, map.getCenter().lng]);
    setMapZoom(Math.min(map.getZoom() + 1, 18));
    triggerHaptic('light');
  }, []);

  const zoomOut = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setMapCenter([map.getCenter().lat, map.getCenter().lng]);
    setMapZoom(Math.max(map.getZoom() - 1, 2));
    triggerHaptic('light');
  }, []);

  return (
    <AppLayout hideNav noPadding>
      <div className="relative h-screen w-full overflow-hidden bg-background">
        <style>{`
          @keyframes pulse-ring {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(2.4); opacity: 0; }
          }
          .friend-map-marker,
          .my-location-marker {
            background: transparent !important;
            border: none !important;
          }
          .leaflet-container {
            height: 100%;
            width: 100%;
            background: hsl(var(--background));
            font-family: inherit;
          }
          .leaflet-control-attribution,
          .leaflet-control-zoom {
            display: none !important;
          }
        `}</style>

        <div ref={mapContainerRef} className="absolute inset-0" />

        <div className="absolute inset-x-0 top-0 z-[1000] safe-area-top">
          <div className="flex items-center gap-3 px-4 pt-3 pb-2">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/70 text-foreground backdrop-blur-xl"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex-1 rounded-2xl border border-border/50 bg-background/55 px-4 py-2 backdrop-blur-xl">
              <h1 className="text-sm font-semibold text-foreground">Friend Map</h1>
              <p className="text-[11px] text-muted-foreground">
                {isLoading ? 'Loading locations…' : `${otherFriends.length} friend${otherFriends.length === 1 ? '' : 's'} on the map`}
              </p>
            </div>

            <button
              onClick={recenterOnMe}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/70 text-foreground backdrop-blur-xl"
            >
              <Locate className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="absolute right-4 top-24 z-[1000] flex flex-col gap-2">
          <button
            onClick={zoomIn}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/50 bg-background/70 text-foreground backdrop-blur-xl"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={zoomOut}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/50 bg-background/70 text-foreground backdrop-blur-xl"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-[1000] safe-area-bottom px-4 pb-6">
          <div className="space-y-3">
            <AnimatePresence>
              {selectedFriend && (
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 18 }}
                  className="rounded-3xl border border-border/50 bg-background/80 p-4 backdrop-blur-2xl shadow-2xl"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15">
                      {selectedFriend.profile?.avatar_url ? (
                        <img
                          src={selectedFriend.profile.avatar_url}
                          alt={selectedFriend.profile.display_name || selectedFriend.profile.username || 'Friend'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-bold text-foreground">
                          {(selectedFriend.profile?.display_name || selectedFriend.profile?.username || '?')[0]}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {selectedFriend.profile?.display_name || selectedFriend.profile?.username || 'Friend'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{selectedFriend.profile?.username || 'friend'}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Updated {formatDistanceToNow(new Date(selectedFriend.updated_at), { addSuffix: true })}
                      </p>
                    </div>

                    <button
                      onClick={() => setSelectedFriend(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => focusFriend(selectedFriend)}
                      className="rounded-2xl border border-border/60 bg-muted/50 px-3 py-2 text-sm font-medium text-foreground"
                    >
                      Center on map
                    </button>
                    <button
                      onClick={() => navigate(`/u/${selectedFriend.profile?.username}`)}
                      className="rounded-2xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      View profile
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              onClick={() => toggleSharing.mutate(!isSharingEnabled)}
              disabled={toggleSharing.isPending}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'w-full rounded-3xl border p-4 text-left backdrop-blur-2xl shadow-2xl transition-all',
                isSharingEnabled
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border/50 bg-background/75'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-2xl',
                    isSharingEnabled ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground'
                  )}
                >
                  <Shield className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {isSharingEnabled ? 'Sharing On' : 'Share My Location'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {isSharingEnabled
                      ? 'Friends can find you for the next 8 hours'
                      : 'Turn this on so friends can see you on the map'}
                  </p>
                </div>

                {isSharingEnabled ? (
                  <ToggleRight className="h-7 w-7 text-primary" />
                ) : (
                  <ToggleLeft className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
            </motion.button>

            {otherFriends.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {otherFriends.map((friend) => (
                  <motion.button
                    key={friend.id}
                    onClick={() => focusFriend(friend)}
                    whileTap={{ scale: 0.96 }}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-2 backdrop-blur-xl transition-all',
                      selectedFriend?.id === friend.id
                        ? 'border-primary/50 bg-primary/15'
                        : 'border-border/50 bg-background/70'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-primary/15">
                        {friend.profile?.avatar_url ? (
                          <img
                            src={friend.profile.avatar_url}
                            alt={friend.profile.display_name || friend.profile.username || 'Friend'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-foreground">
                            {(friend.profile?.display_name || friend.profile?.username || '?')[0]}
                          </span>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-xs font-medium text-foreground">
                        {friend.profile?.display_name || friend.profile?.username || 'Friend'}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
