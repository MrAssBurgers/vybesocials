import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users, Crown, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Community, CommunityRole } from '@/hooks/useCommunities';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { Button } from '@/components/ui/button';

interface CommunityCardProps {
  community: Community & { myRole?: CommunityRole };
  onClick: () => void;
  unreadCount?: number;
}

// Gradient palette for cards
const gradients = [
  'from-violet-500/80 to-purple-600/80',
  'from-blue-500/80 to-cyan-500/80',
  'from-emerald-500/80 to-teal-500/80',
  'from-orange-500/80 to-amber-500/80',
  'from-pink-500/80 to-rose-500/80',
  'from-indigo-500/80 to-blue-500/80',
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
}: CommunityCardProps) {
  const coverUrl = useSignedUrl(community.cover_url || community.banner_url);
  const iconUrl = useSignedUrl(community.icon_url);
  const gradient = getGradient(community.id);
  const isOwner = community.myRole === 'owner';
  const activeCount = community.active_now_count || 0;

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative cursor-pointer group"
    >
      {/* Glass card container */}
      <div className="liquid-glass rounded-2xl overflow-hidden border border-foreground/5 hover:border-primary/20 transition-all duration-300">
        {/* Cover image / gradient */}
        <div className={cn(
          "relative h-32 overflow-hidden",
          !coverUrl && `bg-gradient-to-br ${gradient}`
        )}>
          {coverUrl && (
            <img 
              src={coverUrl} 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          )}
          
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
          
          {/* Live activity indicator */}
          {activeCount > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/90 backdrop-blur-sm text-white text-xs font-medium shadow-lg"
            >
              <Radio className="h-3 w-3 animate-pulse" />
              {activeCount} active
            </motion.div>
          )}
          
          {/* Unread badge */}
          {unreadCount > 0 && (
            <div className="absolute top-3 left-3 min-w-[22px] h-[22px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center shadow-lg">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
          
          {/* Owner badge */}
          {isOwner && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-medium">
              <Crown className="h-3 w-3" />
              Owner
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Icon and name */}
          <div className="flex items-start gap-3">
            {iconUrl ? (
              <img 
                src={iconUrl} 
                alt={community.name}
                className="w-12 h-12 rounded-xl object-cover border-2 border-background shadow-md -mt-8"
              />
            ) : (
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg border-2 border-background shadow-md -mt-8",
                `bg-gradient-to-br ${gradient}`
              )}>
                {community.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            
            <div className="flex-1 min-w-0 pt-1">
              <h3 className="font-semibold text-foreground truncate">{community.name}</h3>
              {community.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {community.description}
                </p>
              )}
            </div>
          </div>
          
          {/* Stats and enter button */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>{community.member_count} members</span>
            </div>
            
            <Button 
              size="sm" 
              className="h-8 px-4 rounded-full text-xs font-medium"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              Enter
            </Button>
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
}: { 
  community: Community;
  onJoin: () => void;
  isJoining: boolean;
}) {
  const coverUrl = useSignedUrl(community.cover_url || community.banner_url);
  const iconUrl = useSignedUrl(community.icon_url);
  const gradient = getGradient(community.id);
  const activeCount = community.active_now_count || 0;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="liquid-glass rounded-2xl overflow-hidden border border-foreground/5"
    >
      {/* Cover */}
      <div className={cn(
        "relative h-24",
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

      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {iconUrl ? (
            <img 
              src={iconUrl} 
              alt={community.name}
              className="w-10 h-10 rounded-lg object-cover border-2 border-background -mt-6"
            />
          ) : (
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm border-2 border-background -mt-6",
              `bg-gradient-to-br ${gradient}`
            )}>
              {community.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{community.name}</h3>
            <p className="text-xs text-muted-foreground">{community.member_count} members</p>
          </div>
        </div>
        
        {community.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{community.description}</p>
        )}
        
        <Button 
          size="sm" 
          className="w-full h-8 rounded-full text-xs"
          onClick={onJoin}
          disabled={isJoining}
        >
          {isJoining ? 'Joining...' : 'Join Community'}
        </Button>
      </div>
    </motion.div>
  );
});
