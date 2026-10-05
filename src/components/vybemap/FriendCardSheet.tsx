import { motion } from 'framer-motion';
import { MessageCircle, Navigation, User, MapPin, Battery, Clock, Hand, Crosshair, X } from 'lucide-react';
import type { LiveFriend } from '@/lib/vybemap/types';
import { activityMeta, speedMph } from '@/lib/vybemap/activity';
import { distanceMiles } from '@/lib/vybemap/geo';
import { cn } from '@/lib/utils';

interface FriendCardSheetProps {
  friend: LiveFriend;
  myCoords: [number, number] | null;
  headingToward?: boolean;
  routeEtaMinutes?: number | null;
  onClose: () => void;
  onMessage: () => void;
  messagePending?: boolean;
  messageError?: string;
  onNavigate: () => void;
  onFind: () => void;
  onProfile: () => void;
  onWave?: () => void;
  onLiveRoute?: () => void;
  onCall?: () => void;
}

function timeSince(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function FriendCardSheet({
  friend, myCoords, headingToward, routeEtaMinutes, onClose, onMessage, messagePending, messageError, onNavigate, onFind, onProfile, onWave, onLiveRoute,
}: FriendCardSheetProps) {
  const name = friend.profile?.display_name || friend.profile?.username || 'Friend';
  const username = friend.profile?.username;
  const approximate = friend.sharing_mode === 'approximate' || (friend.approx_radius_m ?? 0) > 0;
  const activity = activityMeta(friend.activity_type || 'stationary');
  const mph = speedMph(friend.speed);
  const dist = myCoords
    ? distanceMiles(myCoords, [friend.displayLat ?? friend.latitude, friend.displayLng ?? friend.longitude]).toFixed(1)
    : null;
  const isLive = Date.now() - new Date(friend.updated_at).getTime() < 120_000;

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 340 }}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[2000] vybe-map-sheet"
    >
      <div className="flex justify-center pt-3 pb-2">
        <div className="vybe-map-drawer-handle" />
      </div>
      <button type="button" aria-label="Close friend card" onClick={onClose} className="absolute right-3 top-2 h-9 w-9 rounded-full bg-white/8 flex items-center justify-center text-white/70"><X className="h-4 w-4" /></button>

      {headingToward && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-2xl bg-sky-500/12 border border-sky-400/20 px-3 py-2.5">
          <span className="text-lg">🚶‍♂️</span>
          <p className="text-xs font-semibold text-sky-200">
            Heading your way{routeEtaMinutes ? ` · ~${routeEtaMinutes} min` : ''}
          </p>
        </div>
      )}

      <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className={cn('rounded-full p-[3px]', isLive ? 'vybe-map-avatar-ring-live' : 'bg-white/10')}>
              <div className="h-[4.5rem] w-[4.5rem] rounded-full overflow-hidden bg-zinc-800 ring-[3px] ring-[#121820] shadow-lg">
                {friend.profile?.avatar_url ? (
                  <img src={friend.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xl font-bold text-white/40">{name[0]}</div>
                )}
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 text-base bg-[#121820] rounded-full px-1 shadow-sm">{activity.icon}</span>
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-[1.125rem] font-bold text-white truncate tracking-tight">{name}</h3>
            {username && <p className="text-sm text-white/40 font-medium">@{username}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/8 text-white/70">
                {activity.label}{mph ? ` · ${mph}` : ''}
              </span>
              {dist && (
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300">
                  {approximate ? `~${dist} mi to shared area` : `${dist} mi away`}
                </span>
              )}
            </div>
            <div className="flex gap-3 mt-2 text-[10px] text-white/35 font-medium">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{isLive ? 'Live now' : timeSince(friend.updated_at)}</span>
              {friend.battery_percent != null && (
                <span className="flex items-center gap-1"><Battery className="h-3 w-3" />{friend.battery_percent}%</span>
              )}
              {friend.label && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{friend.label}</span>}
            </div>
          </div>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={onFind}
          disabled={!myCoords}
          className="mt-5 w-full vybe-map-find-fab h-12 justify-center text-[15px]"
        >
          <Crosshair className="h-[18px] w-[18px]" />
          {!myCoords ? 'Enable your location to use the finder' : approximate ? 'Find shared area' : 'Find shared location'}
        </motion.button>

        {messageError && <p role="alert" className="mt-3 text-sm text-white/80">{messageError}</p>}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <ActionBtn icon={MessageCircle} label={messagePending ? 'Opening…' : 'Chat'} onClick={messagePending ? undefined : onMessage} />
          <ActionBtn icon={Navigation} label="Route" onClick={onLiveRoute ?? onNavigate} />
          <ActionBtn icon={Hand} label="Wave" onClick={onWave ?? onMessage} />
          <ActionBtn icon={User} label="Profile" onClick={onProfile} />
        </div>
      </div>
    </motion.div>
  );
}

function ActionBtn({
  icon: Icon, label, onClick,
}: {
  icon: typeof MessageCircle;
  label: string;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl text-[10px] font-bold bg-white/6 text-white/75 border border-white/6',
        !onClick && 'opacity-40',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </motion.button>
  );
}
