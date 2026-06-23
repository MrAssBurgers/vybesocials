import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import type { FriendCheckIn } from '@/lib/vybemap/types';

interface FriendActivityBarProps {
  checkIns: FriendCheckIn[];
  onTap?: (c: FriendCheckIn) => void;
}

function label(c: FriendCheckIn): string {
  const name = c.profile?.display_name || c.profile?.username || 'A friend';
  if (c.place_name) return `${name} checked into ${c.place_name}`;
  if (c.message) return `${name}: ${c.message}`;
  return `${name} is vibing nearby`;
}

export function FriendActivityBar({ checkIns, onTap }: FriendActivityBarProps) {
  if (!checkIns.length) return null;
  const top = checkIns.slice(0, 5);

  return (
    <div className="pointer-events-auto mt-2 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {top.map((c) => (
        <motion.button
          key={c.id}
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onTap?.(c)}
          className="shrink-0 flex items-center gap-2 max-w-[240px] rounded-full vybe-map-glass pl-1 pr-3 py-1 text-left"
        >
          <div className="h-7 w-7 rounded-full overflow-hidden bg-white/10 shrink-0">
            {c.profile?.avatar_url ? (
              <img src={c.profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-[10px] text-white/60">?</div>
            )}
          </div>
          <span className="text-[10px] font-semibold text-white/85 truncate">{label(c)}</span>
          <MapPin className="h-3 w-3 text-orange-400 shrink-0" />
        </motion.button>
      ))}
    </div>
  );
}
