/**
 * LiveActivityPanel - Shows who is currently active in the Space
 * With instant join to live calls
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Radio, 
  Phone, 
  MessageCircle,
  Headphones,
  Mic,
  MicOff,
  Users,
  Sparkles
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ActiveMember {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  status: 'chatting' | 'listening' | 'speaking' | 'idle';
  isMuted?: boolean;
}

interface LiveActivityPanelProps {
  members: ActiveMember[];
  isLiveActive?: boolean;
  onJoinLive?: () => void;
  onViewProfile?: (userId: string) => void;
  className?: string;
}

const statusConfig = {
  chatting: { 
    icon: MessageCircle, 
    label: 'Chatting',
    color: 'text-primary',
    bgColor: 'bg-primary/20'
  },
  listening: { 
    icon: Headphones, 
    label: 'Listening',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/20'
  },
  speaking: { 
    icon: Mic, 
    label: 'Speaking',
    color: 'text-green-500',
    bgColor: 'bg-green-500/20'
  },
  idle: { 
    icon: Users, 
    label: 'Here',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted'
  },
};

export const LiveActivityPanel = memo(function LiveActivityPanel({
  members,
  isLiveActive = false,
  onJoinLive,
  onViewProfile,
  className,
}: LiveActivityPanelProps) {
  const speakingMembers = members.filter(m => m.status === 'speaking');
  const otherMembers = members.filter(m => m.status !== 'speaking');

  if (members.length === 0 && !isLiveActive) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Radio className="h-5 w-5 text-primary" />
            {isLiveActive && (
              <motion.div
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-card"
              />
            )}
          </div>
          <span className="font-semibold text-sm">Activity</span>
          <span className="text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? 'person' : 'people'}
          </span>
        </div>

        {isLiveActive && onJoinLive && (
          <Button
            size="sm"
            onClick={onJoinLive}
            className="rounded-full gap-1.5 h-8 px-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90"
          >
            <Phone className="h-3.5 w-3.5" />
            Join
          </Button>
        )}
      </div>

      {/* Members grid */}
      <div className="p-3">
        {/* Speaking members first */}
        {speakingMembers.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 mb-2">
              Speaking
            </p>
            <div className="flex flex-wrap gap-2">
              {speakingMembers.map((member) => (
                <MemberChip 
                  key={member.id} 
                  member={member} 
                  onClick={() => onViewProfile?.(member.userId)}
                  highlight
                />
              ))}
            </div>
          </div>
        )}

        {/* Other active members */}
        {otherMembers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {otherMembers.slice(0, 12).map((member) => (
              <MemberChip 
                key={member.id} 
                member={member}
                onClick={() => onViewProfile?.(member.userId)}
              />
            ))}
            {otherMembers.length > 12 && (
              <div className="flex items-center justify-center h-10 px-3 rounded-full bg-muted text-sm text-muted-foreground">
                +{otherMembers.length - 12} more
              </div>
            )}
          </div>
        )}

        {members.length === 0 && isLiveActive && (
          <div className="text-center py-4">
            <Sparkles className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Be the first to join!
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
});

// Individual member chip
const MemberChip = memo(function MemberChip({
  member,
  onClick,
  highlight = false,
}: {
  member: ActiveMember;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const config = statusConfig[member.status];
  const Icon = config.icon;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "flex items-center gap-2 h-10 px-2 pr-3 rounded-full transition-all",
        highlight 
          ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 ring-1 ring-green-500/50"
          : "bg-muted/50 hover:bg-muted"
      )}
    >
      <Avatar className="h-6 w-6">
        {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
        <AvatarFallback className="text-xs">
          {member.username.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium truncate max-w-[80px]">
        {member.displayName || member.username}
      </span>
      <div className={cn(
        "h-5 w-5 rounded-full flex items-center justify-center",
        config.bgColor
      )}>
        {member.isMuted ? (
          <MicOff className="h-3 w-3 text-muted-foreground" />
        ) : (
          <Icon className={cn("h-3 w-3", config.color)} />
        )}
      </div>
    </motion.button>
  );
});
