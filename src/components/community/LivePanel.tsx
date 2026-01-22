import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Phone, Headphones, MessageCircle, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCommunityMembers, useLiveActivity } from '@/hooks/useCommunities';

interface LivePanelProps {
  communityId: string;
  onJoinLive?: () => void;
}

const activityIcons = {
  live: Radio,
  listening: Headphones,
  chatting: MessageCircle,
  browsing: MessageCircle,
};

const activityLabels = {
  live: 'Live',
  listening: 'Listening',
  chatting: 'Chatting',
  browsing: 'Active',
};

const activityColors = {
  live: 'bg-red-500',
  listening: 'bg-purple-500',
  chatting: 'bg-blue-500',
  browsing: 'bg-green-500',
};

export const LivePanel = memo(function LivePanel({ communityId, onJoinLive }: LivePanelProps) {
  const { data: activity = [] } = useLiveActivity(communityId);
  const { data: members = [] } = useCommunityMembers(communityId);

  // Combine activity with member profiles
  const liveUsers = useMemo(() => {
    return activity.map(a => {
      const member = members.find(m => m.user_id === a.user_id);
      return {
        ...a,
        profile: member?.profile,
      };
    }).filter(a => a.profile); // Only show users with profiles
  }, [activity, members]);

  const liveStreamers = liveUsers.filter(u => u.activity_type === 'live');
  const activeListeners = liveUsers.filter(u => u.activity_type === 'listening');
  const activeChatters = liveUsers.filter(u => u.activity_type === 'chatting' || u.activity_type === 'browsing');

  if (liveUsers.length === 0) {
    return null;
  }

  return (
    <div className="liquid-glass rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Radio className="h-4 w-4 text-green-400 animate-pulse" />
          Live Now
        </h3>
        <span className="text-xs text-muted-foreground">{liveUsers.length} active</span>
      </div>

      {/* Live streamers - prominent display */}
      {liveStreamers.length > 0 && (
        <div className="space-y-2">
          {liveStreamers.map(user => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-2 rounded-xl bg-red-500/10 border border-red-500/20"
            >
              <div className="relative">
                <Avatar className="h-10 w-10 ring-2 ring-red-500 ring-offset-2 ring-offset-background">
                  <AvatarImage src={user.profile?.avatar_url || undefined} />
                  <AvatarFallback>
                    {(user.profile?.display_name || user.profile?.username)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                  <Radio className="h-2.5 w-2.5 text-white animate-pulse" />
                </span>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {user.profile?.display_name || user.profile?.username}
                </p>
                <p className="text-xs text-red-400">Going live</p>
              </div>
              
              <Button size="sm" variant="ghost" className="h-8 px-3 text-red-400 hover:text-red-300 hover:bg-red-500/10">
                Join
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Active users - compact grid */}
      {(activeListeners.length > 0 || activeChatters.length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Active members
            </span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {[...activeListeners, ...activeChatters].slice(0, 8).map(user => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative group"
              >
                <Avatar className="h-9 w-9 ring-1 ring-foreground/10 cursor-pointer hover:ring-primary/50 transition-all">
                  <AvatarImage src={user.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {(user.profile?.display_name || user.profile?.username)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                {/* Activity indicator */}
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                  activityColors[user.activity_type as keyof typeof activityColors] || 'bg-green-500'
                )} />
                
                {/* Hover tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-lg bg-popover text-popover-foreground text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg">
                  {user.profile?.display_name || user.profile?.username}
                  <span className="text-muted-foreground ml-1">
                    · {activityLabels[user.activity_type as keyof typeof activityLabels]}
                  </span>
                </div>
              </motion.div>
            ))}
            
            {/* Overflow count */}
            {liveUsers.length > 8 && (
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                +{liveUsers.length - 8}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Join live button */}
      {onJoinLive && (
        <Button 
          onClick={onJoinLive}
          className="w-full gap-2 rounded-full"
          variant="outline"
        >
          <Phone className="h-4 w-4" />
          Start Live Session
        </Button>
      )}
    </div>
  );
});

// Compact inline live indicator for room tabs
export const LiveIndicator = memo(function LiveIndicator({ 
  count,
  className,
}: { 
  count: number;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium",
        className
      )}
    >
      <Radio className="h-3 w-3 animate-pulse" />
      {count}
    </motion.div>
  );
});
