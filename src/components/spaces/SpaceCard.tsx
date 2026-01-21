/**
 * SpaceCard - A card component for displaying a VYBE Space
 * Original design, NOT Discord-like
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users, ArrowRight, Zap, Crown, Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SpaceCardProps {
  id: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  memberCount: number;
  liveCount?: number;
  unreadCount?: number;
  role?: 'owner' | 'moderator' | 'member';
  isSelected?: boolean;
  onEnter: () => void;
}

// Generate a gradient based on space ID for visual variety
function getSpaceGradient(id: string): string {
  const gradients = [
    'from-primary/40 via-primary/20 to-accent/30',
    'from-accent/40 via-accent/20 to-primary/30',
    'from-purple-500/40 via-purple-400/20 to-pink-400/30',
    'from-cyan-500/40 via-cyan-400/20 to-blue-400/30',
    'from-orange-500/40 via-orange-400/20 to-yellow-400/30',
    'from-green-500/40 via-green-400/20 to-emerald-400/30',
    'from-rose-500/40 via-rose-400/20 to-pink-400/30',
    'from-indigo-500/40 via-indigo-400/20 to-purple-400/30',
  ];
  
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

export const SpaceCard = memo(function SpaceCard({
  id,
  name,
  description,
  iconUrl,
  bannerUrl,
  memberCount,
  liveCount = 0,
  unreadCount = 0,
  role,
  isSelected,
  onEnter,
}: SpaceCardProps) {
  const gradient = getSpaceGradient(id);
  const hasLiveActivity = liveCount > 0;

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        "relative group cursor-pointer",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      onClick={onEnter}
    >
      {/* Card container */}
      <div className={cn(
        "relative overflow-hidden rounded-3xl transition-all duration-300",
        "bg-gradient-to-br",
        gradient
      )}>
        {/* Banner/Background */}
        <div className="h-24 sm:h-28 relative overflow-hidden">
          {bannerUrl ? (
            <img 
              src={bannerUrl} 
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className={cn(
              "absolute inset-0 bg-gradient-to-br",
              gradient
            )} />
          )}
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
          
          {/* Live indicator */}
          {hasLiveActivity && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/90 backdrop-blur-sm"
            >
              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-semibold text-white">{liveCount} live</span>
            </motion.div>
          )}
          
          {/* Unread badge */}
          {unreadCount > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-3 left-3 min-w-[24px] h-6 px-2 rounded-full bg-destructive flex items-center justify-center"
            >
              <span className="text-xs font-bold text-destructive-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </motion.div>
          )}
        </div>

        {/* Content */}
        <div className="relative px-4 pb-4 -mt-8">
          {/* Avatar */}
          <div className="relative inline-block mb-3">
            <Avatar className="h-16 w-16 ring-4 ring-card shadow-lg">
              {iconUrl ? (
                <AvatarImage src={iconUrl} alt={name} />
              ) : null}
              <AvatarFallback className={cn(
                "text-lg font-bold bg-gradient-to-br text-white",
                gradient.replace('/40', '').replace('/20', '').replace('/30', '')
              )}>
                {name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            {/* Role indicator */}
            {role && role !== 'member' && (
              <div className={cn(
                "absolute -bottom-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center shadow-md",
                role === 'owner' ? "bg-yellow-500" : role === 'moderator' ? "bg-blue-500" : "bg-muted"
              )}>
                {role === 'owner' ? (
                  <Crown className="h-3.5 w-3.5 text-white" />
                ) : (
                  <Shield className="h-3.5 w-3.5 text-white" />
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-2">
            <h3 className="font-bold text-lg leading-tight line-clamp-1">
              {name}
            </h3>
            
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {description}
              </p>
            )}

            {/* Stats row */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {memberCount} members
                </span>
              </div>
              
              {/* Enter button */}
              <Button
                size="sm"
                className="rounded-full px-4 gap-1.5 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onEnter();
                }}
              >
                Enter
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Hover glow effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent" />
        </div>
      </div>
    </motion.div>
  );
});
