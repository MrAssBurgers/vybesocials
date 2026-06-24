import { motion } from 'framer-motion';
import { MessageCircle, Navigation, User, MapPin, Battery, Clock, Hand } from 'lucide-react';
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
  friend, myCoords, headingToward, routeEtaMinutes, onClose, onMessage, onNavigate, onFind, onProfile, onWave, onLiveRoute, onCall,
}: FriendCardSheetProps) {
  const name = friend.profile?.display_name || friend.profile?.username || 'Friend';
  const username = friend.profile?.username;
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
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[2000] rounded-t-[1.75rem] bg-white/[0.98] backdrop-blur-2xl border-t border-black/5 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-16px_48px_rgba(0,0,0,0.12)]"
    >
      <div className="flex justify-center mb-3">
        <div className="w-9 h-1 rounded-full bg-black/12" />
      </div>

      {headingToward && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-sky-500/10 border border-sky-400/20 px-3 py-2">
          <span className="text-lg">🚶‍♂️</span>
          <p className="text-xs font-semibold text-sky-800">
            Heading your way{routeEtaMinutes ? ` · ~${routeEtaMinutes} min` : ''}
          </p>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className={cn('rounded-full p-[3px]', isLive ? 'bg-gradient-to-br from-yellow-400 via-pink-500 to-violet-500' : 'bg-black/10')}>
            <div className="h-16 w-16 rounded-full overflow-hidden bg-zinc-100 ring-2 ring-white">
              {friend.profile?.avatar_url ? (
                <img src={friend.profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xl font-bold text-black/40">{name[0]}</div>
              )}
            </div>
          </div>
          <span className="absolute -bottom-1 -right-1 text-lg">{activity.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-black truncate">{name}</h3>
          {username && <p className="text-sm text-black/45">@{username}</p>}
          {friend.profile?.bio && <p className="text-xs text-black/40 mt-1 line-clamp-2">{friend.profile.bio}</p>}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/[0.04]', activity.color)}>
              {activity.label}{mph ? ` · ${mph}` : ''}
            </span>
            {dist && <span className="text-[10px] text-black/40 px-2 py-0.5 rounded-full bg-black/[0.03]">{dist} mi away</span>}
            {friend.city && <span className="text-[10px] text-black/40 px-2 py-0.5 rounded-full bg-black/[0.03]">{friend.city}</span>}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-black/35">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{isLive ? 'Live' : timeSince(friend.updated_at)}</span>
            {friend.battery_percent != null && (
              <span className="flex items-center gap-1"><Battery className="h-3 w-3" />{friend.battery_percent}%</span>
            )}
            {friend.label && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{friend.label}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-5">
        <ActionBtn icon={MessageCircle} label="Chat" onClick={onMessage} primary />
        <ActionBtn icon={Navigation} label="Directions" onClick={onLiveRoute ?? onNavigate} />
        <ActionBtn icon={Hand} label="Wave" onClick={onWave ?? onMessage} />
        <ActionBtn icon={User} label="Profile" onClick={onProfile} />
      </div>
      <button type="button" onClick={onClose} className="mt-3 w-full py-2 text-xs text-black/35">Close</button>
    </motion.div>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, primary, highlight,
}: {
  icon: typeof MessageCircle;
  label: string;
  onClick?: () => void;
  primary?: boolean;
  highlight?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex flex-col items-center gap-1 py-2.5 rounded-2xl text-[9px] font-bold',
        primary && 'bg-[#111] text-white',
        highlight && 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white',
        !primary && !highlight && 'bg-black/[0.05] text-black/80',
        !onClick && 'opacity-40',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </motion.button>
  );
}
