import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users, Crown, Shield, Radio, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Community, CommunityRole } from '@/hooks/useCommunities';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface CommunityCardProps {
  community: Community & { myRole?: CommunityRole };
  onClick: () => void;
  unreadCount?: number;
  index?: number;
}

// Gradient palette for cards
const gradients = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',
  'from-indigo-500 to-blue-500',
  'from-fuchsia-500 to-pink-500',
  'from-cyan-500 to-sky-500',
];

function getGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export const CommunityCard = memo(function CommunityCard({ 
  community, 
  onClick,
  unreadCount = 0,
  index = 0,
}: CommunityCardProps) {
  const coverUrl = useSignedUrl(community.cover_url || community.banner_url);
  const iconUrl = useSignedUrl(community.icon_url);
  const gradient = getGradient(community.id);
  const isOwner = community.myRole === 'owner';
  const isMod = community.myRole === 'moderator';
  const activeCount = community.active_now_count || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{ y: -6, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative cursor-pointer group h-full"
    >
      <div className="liquid-glass rounded-2xl overflow-hidden border border-foreground/5 hover:border-primary/30 transition-all duration-300 h-full flex flex-col hover:shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.3)]">
        {/* Cover area */}
        <div className={cn(
          "relative h-28 overflow-hidden shrink-0",
          !coverUrl && `bg-gradient-to-br ${gradient}`
        )}>
          {coverUrl && (
            <img 
              src={coverUrl} 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
          )}
          
          {/* Shimmer on hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          
          {/* Bottom fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
          
          {/* Active badge */}
          {activeCount > 0 && (
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/90 backdrop-blur-sm text-white text-[10px] font-semibold shadow-lg"
            >
              <Radio className="h-2.5 w-2.5 animate-pulse" />
              {activeCount} active
            </motion.div>
          )}
          
          {/* Unread */}
          {unreadCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="absolute top-2.5 left-2.5 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-lg"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.div>
          )}
          
          {/* Role badge */}
          {(isOwner || isMod) && (
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-[10px] font-medium"
              style={{ background: isOwner ? 'rgba(245, 158, 11, 0.85)' : 'rgba(59, 130, 246, 0.85)' }}
            >
              {isOwner ? <Crown className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
              {isOwner ? 'Owner' : 'Mod'}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-3.5 flex flex-col flex-1">
          <div className="flex items-start gap-3">
            {/* Icon overlapping cover */}
            <div className="shrink-0 -mt-6 relative">
              {iconUrl ? (
                <img 
                  src={iconUrl} 
                  alt={community.name}
                  className="w-12 h-12 rounded-xl object-cover border-[2.5px] border-background shadow-md"
                />
              ) : (
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm border-[2.5px] border-background shadow-md",
                  `bg-gradient-to-br ${gradient}`
                )}>
                  {community.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="font-semibold text-sm text-foreground truncate">{community.name}</h3>
              {community.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                  {community.description}
                </p>
              )}
            </div>
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{community.member_count} members</span>
            </div>
            
            <motion.div
              className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              whileHover={{ x: 3 }}
            >
              Enter
              <ArrowRight className="h-3 w-3" />
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// Public community card for discovery
export const PublicCommunityCard = memo(function PublicCommunityCard({ 
  community,
  onJoin,
  isJoining,
  index = 0,
}: { 
  community: Community;
  onJoin: () => void;
  isJoining: boolean;
  index?: number;
}) {
  const coverUrl = useSignedUrl(community.cover_url || community.banner_url);
  const iconUrl = useSignedUrl(community.icon_url);
  const gradient = getGradient(community.id);
  const activeCount = community.active_now_count || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="liquid-glass rounded-2xl overflow-hidden border border-foreground/5 hover:border-primary/20 transition-all duration-300 h-full flex flex-col"
    >
      {/* Cover */}
      <div className={cn(
        "relative h-24 overflow-hidden shrink-0",
        !coverUrl && `bg-gradient-to-br ${gradient}`
      )}>
        {coverUrl && (
          <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        
        {activeCount > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/90 text-white text-[10px] font-medium">
            <Radio className="h-2.5 w-2.5 animate-pulse" />
            {activeCount} active
          </div>
        )}
      </div>

      <div className="p-3.5 space-y-3 flex flex-col flex-1">
        <div className="flex items-start gap-3">
          {iconUrl ? (
            <img 
              src={iconUrl} 
              alt={community.name}
              className="w-11 h-11 rounded-xl object-cover border-[2.5px] border-background -mt-5 shrink-0"
            />
          ) : (
            <div className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm border-[2.5px] border-background -mt-5 shrink-0",
              `bg-gradient-to-br ${gradient}`
            )}>
              {community.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{community.name}</h3>
            <p className="text-[11px] text-muted-foreground">{community.member_count} members</p>
          </div>
        </div>
        
        {community.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">{community.description}</p>
        )}
        
        <div className="mt-auto">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full h-8 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            onClick={onJoin}
            disabled={isJoining}
          >
            {isJoining ? 'Joining...' : 'Join Community'}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
});
