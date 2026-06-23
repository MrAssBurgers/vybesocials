import { motion } from 'framer-motion';
import { MessageCircle, Navigation, Phone, User, MapPin, Battery, Clock, Sparkles, Hand } from 'lucide-react';
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
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[2000] rounded-t-3xl bg-black/92 backdrop-blur-2xl border-t border-white/10 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex justify-center mb-3">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      {headingToward && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-cyan-500/15 border border-cyan-400/30 px-3 py-2">
          <span className="text-lg">🚶‍♂️</span>
          <p className="text-xs font-semibold text-cyan-200">
            Heading your way{routeEtaMinutes ? ` · ~${routeEtaMinutes} min` : ''}
          </p>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className={cn('rounded-full p-0.5', isLive ? 'bg-gradient-to-br from-green-400 to-emerald-500' : 'bg-white/20')}>
            <div className="h-16 w-16 rounded-full overflow-hidden bg-black">
              {friend.profile?.avatar_url ? (
                <img src={friend.profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xl font-bold text-white">{name[0]}</div>
              )}
            </div>
          </div>
          <span className="absolute -bottom-1 -right-1 text-lg">{activity.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white truncate">{name}</h3>
          {username && <p className="text-sm text-white/50">@{username}</p>}
          {friend.profile?.bio && <p className="text-xs text-white/40 mt-1 line-clamp-2">{friend.profile.bio}</p>}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10', activity.color)}>
              {activity.label}{mph ? ` · ${mph}` : ''}
            </span>
            {dist && <span className="text-[10px] text-white/40 px-2 py-0.5 rounded-full bg-white/5">{dist} mi away</span>}
            {friend.city && <span className="text-[10px] text-white/40 px-2 py-0.5 rounded-full bg-white/5">{friend.city}</span>}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-white/35">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{isLive ? 'Live' : timeSince(friend.updated_at)}</span>
            {friend.battery_percent != null && (
              <span className="flex items-center gap-1"><Battery className="h-3 w-3" />{friend.battery_percent}%</span>
            )}
            {friend.label && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{friend.label}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 mt-5">
        <ActionBtn icon={MessageCircle} label="Message" onClick={onMessage} primary />
        <ActionBtn icon={Navigation} label="Route" onClick={onLiveRoute ?? onNavigate} />
        <ActionBtn icon={Hand} label="Wave" onClick={onWave ?? onMessage} highlight />
        <ActionBtn icon={Sparkles} label="Find" onClick={onFind} />
        <ActionBtn icon={User} label="Profile" onClick={onProfile} />
      </div>
      {onCall && (
        <button type="button" onClick={onCall} className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold">
          <Phone className="h-4 w-4" /> Call
        </button>
      )}
      <button type="button" onClick={onClose} className="mt-3 w-full py-2 text-xs text-white/40">Dismiss</button>
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
        primary && 'bg-primary text-primary-foreground',
        highlight && 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white',
        !primary && !highlight && 'bg-white/10 text-white',
        !onClick && 'opacity-40',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </motion.button>
  );
}
