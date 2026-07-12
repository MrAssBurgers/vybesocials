import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, MoreHorizontal, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { useUserOnlineStatus } from '@/hooks/usePresence';
import { MutualFriendsDisplay } from '@/components/profile/MutualFriendsDisplay';
import { cn } from '@/lib/utils';

interface FriendProfileHeaderProps {
  profile: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
  };
  showBio?: boolean;
  showMutualFriends?: boolean;
  onMoreMenu: () => void;
  className?: string;
}

export const FriendProfileHeader = memo(function FriendProfileHeader({
  profile,
  showBio = true,
  showMutualFriends = true,
  onMoreMenu,
  className,
}: FriendProfileHeaderProps) {
  const navigate = useNavigate();
  const { data: presence } = useUserOnlineStatus(profile.id);
  const isOnline = presence?.is_online;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border border-white/10 bg-card/50 backdrop-blur-xl p-4 shadow-lg',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full -ml-1"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="relative shrink-0">
          <Avatar className="h-16 w-16 ring-2 ring-primary/30">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="text-xl bg-primary/20">
              {profile.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isOnline && (
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-background" />
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <h1 className="text-lg font-bold truncate">
            {profile.display_name || profile.username}
          </h1>
          <StyledUsername
            userId={profile.id}
            username={profile.username}
            className="text-sm text-muted-foreground"
          />
          {showBio && profile.bio && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{profile.bio}</p>
          )}
          {showMutualFriends && (
            <div className="mt-2">
              <MutualFriendsDisplay targetUserId={profile.id} variant="compact" />
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={onMoreMenu}
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-primary/80">
        <Shield className="h-3 w-3" />
        <span>Private friend profile</span>
      </div>
    </motion.div>
  );
});
