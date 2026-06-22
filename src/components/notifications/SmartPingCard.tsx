import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MapPin, Sparkles, Users, TrendingUp, Brain } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { parseApiDate } from '@/lib/parseApiDate';

interface SmartPingCardProps {
  id: string;
  subtype?: string | null;
  title?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  deepLink?: string | null;
  meta?: any;
  createdAt: string;
  read: boolean;
}

const SUBTYPE_META: Record<string, { icon: any; label: string; color: string }> = {
  nearby_post: { icon: MapPin, label: 'Near you', color: 'text-cyan-400' },
  friend_activity: { icon: Users, label: 'Friend', color: 'text-violet-400' },
  trending_local: { icon: TrendingUp, label: 'Trending', color: 'text-amber-400' },
  brief_item: { icon: Brain, label: 'Daily Brief', color: 'text-emerald-400' },
};

export function SmartPingCard({
  subtype,
  title,
  body,
  imageUrl,
  deepLink,
  meta,
  createdAt,
  read,
}: SmartPingCardProps) {
  const navigate = useNavigate();
  const cfg = SUBTYPE_META[subtype || ''] || { icon: Sparkles, label: 'Smart', color: 'text-primary' };
  const Icon = cfg.icon;
  const dist = meta?.distance_miles;
  const createdLabel = (() => {
    const date = parseApiDate(createdAt);
    if (!date) return '';
    try {
      return formatDistanceToNow(date, { addSuffix: false });
    } catch {
      return '';
    }
  })();

  const handleTap = () => {
    haptics.tap();
    if (!deepLink) return;
    const sep = deepLink.includes('?') ? '&' : '?';
    const extra = new URLSearchParams();
    if (title) extra.set('nTitle', title);
    if (body) extra.set('nBody', body);
    navigate(`${deepLink}${sep}${extra.toString()}`);
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleTap}
      className={cn(
        'w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/50 active:scale-[0.98] transition',
        !read && 'ring-1 ring-primary/30',
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
        />
      ) : (
        <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted/50', cfg.color)}>
          <Icon className="w-6 h-6" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
          <span className={cn('text-[11px] font-semibold uppercase tracking-wide', cfg.color)}>
            {cfg.label}
          </span>
          {typeof dist === 'number' && (
            <span className="text-[11px] text-muted-foreground">
              · {dist < 0.2 ? 'right here' : `${dist.toFixed(1)} mi`}
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {createdLabel}
          </span>
        </div>
        {title && (
          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
        )}
        {body && (
          <p className="text-sm text-muted-foreground line-clamp-2">{body}</p>
        )}
      </div>
    </motion.button>
  );
}
