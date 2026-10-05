import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';
import type { LiveFriend } from '@/lib/vybemap/types';
import { bearingDegrees, distanceFeet, formatDistance, lerpAngleDegrees, proximityColor } from '@/lib/vybemap/geo';
import { subscribeDeviceHeading } from '@/lib/vybemap/deviceHeading';
import { triggerHaptic } from '@/lib/haptics';

interface FindFriendOverlayProps {
  friend: LiveFriend;
  myCoords: [number, number];
  arMode?: boolean;
  onClose: () => void;
  onFound: () => void;
}

export function FindFriendOverlay({ friend, myCoords, onClose, onFound }: FindFriendOverlayProps) {
  const [displayHeading, setDisplayHeading] = useState(0);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [liveCoords, setLiveCoords] = useState(myCoords);
  const lastHapticRef = useRef(0);
  const foundRef = useRef(false);
  const targetHeadingRef = useRef(0);
  const displayHeadingRef = useRef(0);
  const rafRef = useRef(0);
  const signedAvatar = useFastSignedUrl(friend.profile?.avatar_url);

  const targetLat = friend.displayLat ?? friend.latitude;
  const targetLng = friend.displayLng ?? friend.longitude;
  const feet = distanceFeet(liveCoords, [targetLat, targetLng]);
  const bearing = bearingDegrees(liveCoords, [targetLat, targetLng]);
  const name = friend.profile?.display_name || friend.profile?.username || 'Friend';
  const color = proximityColor(feet);
  const approximate = friend.sharing_mode === 'approximate' || (friend.approx_radius_m ?? 0) > 0;
  const found = !approximate && feet < 80;

  useEffect(() => {
    setLiveCoords(myCoords);
  }, [myCoords]);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setLiveCoords([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    return subscribeDeviceHeading((sample) => {
      setDeviceHeading(sample.heading);
    });
  }, []);

  useEffect(() => {
    const arrow = deviceHeading != null ? bearing - deviceHeading : bearing;
    targetHeadingRef.current = ((arrow % 360) + 360) % 360;
  }, [bearing, deviceHeading]);

  useEffect(() => {
    const tick = () => {
      const target = targetHeadingRef.current;
      const current = displayHeadingRef.current;
      const next = lerpAngleDegrees(current, target, 0.18);
      displayHeadingRef.current = next;
      setDisplayHeading(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (approximate) return;
    const now = Date.now();
    if (feet < 80 && !foundRef.current) {
      foundRef.current = true;
      triggerHaptic('success');
      onFound();
    } else if (feet < 600 && now - lastHapticRef.current > 1800) {
      lastHapticRef.current = now;
      triggerHaptic('light');
    }
  }, [feet, onFound, approximate]);

  const distanceLabel = approximate ? `${formatDistance(feet)} to area` : feet < 80 ? 'Here' : formatDistance(feet);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[5000] flex flex-col bg-[#0a0a0c] text-white"
    >
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <button type="button" onClick={onClose} className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
          <X className="h-5 w-5" />
        </button>
        <span className="text-xs font-semibold tracking-wide text-white/60 uppercase">Find {name.split(' ')[0]}</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        <AnimatePresence mode="wait">
          {found ? (
            <motion.div key="found" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
              <p className="text-sm text-white/50 mb-2">Arrived</p>
              <h2 className="text-4xl font-semibold tracking-tight">{name}</h2>
              <p className="text-emerald-400 mt-2 font-medium">Right nearby</p>
            </motion.div>
          ) : (
            <motion.div key="hunt" className="flex flex-col items-center gap-6 w-full max-w-sm">
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-1">Distance</p>
                <p className="text-5xl font-light tabular-nums tracking-tight" style={{ color }}>{distanceLabel}</p>
                <p className="text-sm text-white/45 mt-2">{approximate ? `Arrow points to the shared area, within about ${Math.round((friend.approx_radius_m || 2000) / 1000)} km. Your friend may be anywhere in it.` : `Move your phone — arrow points toward ${name.split(' ')[0]}’s shared GPS position`}</p>
              </div>

              <div className="relative w-72 h-72">
                <div className="vybe-find-ring" aria-hidden />
                <div className="vybe-find-ring vybe-find-ring--2" aria-hidden />
                <div className="vybe-find-ring vybe-find-ring--3" aria-hidden />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="vybe-find-arrow"
                    style={{ '--find-heading': `${displayHeading}deg`, '--find-color': color } as CSSProperties}
                    aria-hidden
                  >
                    <div className="vybe-find-arrow__glyph" />
                  </div>
                  <div className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-white/30 shadow-xl bg-white/5">
                    {signedAvatar ? (
                      <img src={signedAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-blue-500 to-cyan-400">
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-center text-[10px] text-white/30 pb-[max(env(safe-area-inset-bottom),16px)] px-8">
        {approximate ? 'Approximate sharing does not reveal an exact position or confirm arrival.' : 'GPS + compass estimates · GPS accuracy varies'}
      </p>
    </motion.div>
  );
}
