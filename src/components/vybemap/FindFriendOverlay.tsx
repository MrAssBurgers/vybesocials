import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, X, Camera } from 'lucide-react';
import type { LiveFriend } from '@/lib/vybemap/types';
import { bearingDegrees, distanceFeet, formatDistance, proximityColor } from '@/lib/vybemap/geo';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface FindFriendOverlayProps {
  friend: LiveFriend;
  myCoords: [number, number];
  arMode?: boolean;
  onClose: () => void;
  onFound: () => void;
}

export function FindFriendOverlay({ friend, myCoords, arMode, onClose, onFound }: FindFriendOverlayProps) {
  const [heading, setHeading] = useState(0);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const lastHapticRef = useRef(0);
  const foundRef = useRef(false);

  const targetLat = friend.displayLat ?? friend.latitude;
  const targetLng = friend.displayLng ?? friend.longitude;
  const feet = distanceFeet(myCoords, [targetLat, targetLng]);
  const bearing = bearingDegrees(myCoords, [targetLat, targetLng]);
  const name = friend.profile?.display_name || friend.profile?.username || 'Friend';

  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      const h = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
        ?? (e.alpha != null ? 360 - e.alpha : null);
      if (h != null) setDeviceHeading(h);
    };
    window.addEventListener('deviceorientation', onOrient, true);
    return () => window.removeEventListener('deviceorientation', onOrient, true);
  }, []);

  useEffect(() => {
    const arrow = deviceHeading != null ? bearing - deviceHeading : bearing;
    setHeading(arrow);
  }, [bearing, deviceHeading]);

  useEffect(() => {
    const now = Date.now();
    if (feet < 150 && !foundRef.current) {
      foundRef.current = true;
      triggerHaptic('success');
      onFound();
    } else if (feet < 800 && now - lastHapticRef.current > 2000) {
      lastHapticRef.current = now;
      triggerHaptic('light');
    }
  }, [feet, onFound]);

  const color = proximityColor(feet);

  if (arMode) {
    return (
      <ARFindView
        name={name}
        feet={feet}
        heading={heading}
        avatar={friend.profile?.avatar_url}
        onClose={onClose}
        found={feet < 150}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[5000] bg-black flex flex-col items-center justify-center"
    >
      <button type="button" onClick={onClose} className="absolute top-6 right-6 p-3 rounded-full bg-white/10 text-white z-10">
        <X className="h-6 w-6" />
      </button>

      <AnimatePresence mode="wait">
        {feet < 150 ? (
          <motion.div
            key="found"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center px-8"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-6xl mb-6"
            >
              🎉
            </motion.div>
            <h2 className="text-3xl font-black text-white tracking-tight">YOU FOUND THEM</h2>
            <p className="text-white/60 mt-2">{name} is right here</p>
          </motion.div>
        ) : (
          <motion.div key="hunt" className="flex flex-col items-center gap-8 px-6 w-full max-w-md">
            <p className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">Find Friend</p>
            <p className="text-lg font-bold text-white text-center">
              {name.toUpperCase()} IS {formatDistance(feet)} AWAY
            </p>

            <div className="relative w-48 h-48">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <motion.div
                className="absolute inset-0 flex items-start justify-center pt-4"
                animate={{ rotate: heading }}
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              >
                <Navigation className="h-16 w-16 drop-shadow-lg" style={{ color }} fill={color} />
              </motion.div>
              {friend.profile?.avatar_url ? (
                <img src={friend.profile.avatar_url} alt="" className="absolute inset-8 rounded-full object-cover border-4 border-white/20" />
              ) : (
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-2xl font-bold text-white">
                  {name[0]}
                </div>
              )}
            </div>

            <p className="text-sm text-white/40">Follow the arrow · vibration gets faster as you get closer</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ARFindView({
  name, feet, heading, avatar, onClose, found,
}: {
  name: string;
  feet: number;
  heading: number;
  avatar?: string | null;
  onClose: () => void;
  found: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      })
      .catch(() => { /* AR fallback */ });
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <div className="fixed inset-0 z-[5000] bg-black">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
      <div className="absolute inset-0 bg-black/30" />
      <button type="button" onClick={onClose} className="absolute top-6 right-6 p-3 rounded-full bg-black/50 text-white z-20">
        <X className="h-6 w-6" />
      </button>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
        {found ? (
          <h2 className="text-4xl font-black text-white drop-shadow-lg">YOU FOUND THEM</h2>
        ) : (
          <>
            <motion.div animate={{ rotate: heading }} transition={{ type: 'spring', stiffness: 100, damping: 15 }}>
              <Navigation className="h-24 w-24 text-green-400 drop-shadow-2xl" fill="currentColor" />
            </motion.div>
            <p className="mt-8 text-xl font-bold text-white drop-shadow-md">{name}</p>
            <p className="text-white/80 font-mono text-lg mt-2">{formatDistance(feet)}</p>
          </>
        )}
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 text-white text-xs">
        <Camera className="h-4 w-4" /> AR Find Mode
      </div>
    </div>
  );
}
