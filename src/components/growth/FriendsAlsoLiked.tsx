import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface FriendsAlsoLikedProps {
  postId: string;
  className?: string;
}

interface FriendLike {
  id: string;
  username: string;
  avatar_url: string | null;
}

const FriendAvatarSmall = memo(function FriendAvatarSmall({ 
  friend, 
  index 
}: { 
  friend: FriendLike; 
  index: number;
}) {
  const signedUrl = useSignedUrl(friend.avatar_url);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      style={{ marginLeft: index > 0 ? '-8px' : 0, zIndex: 10 - index }}
    >
      <Avatar className="h-5 w-5 border border-background">
        <AvatarImage src={signedUrl || undefined} />
        <AvatarFallback className="text-[8px] bg-primary/20">
          {friend.username?.[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </motion.div>
  );
});

export const FriendsAlsoLiked = memo(function FriendsAlsoLiked({ 
  postId, 
  className 
}: FriendsAlsoLikedProps) {
  const { profile } = useAuth();

  const { data: friendLikes } = useQuery({
    queryKey: ['friends-also-liked', postId, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Get user's friends
      const { data: friendships } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
        .eq('status', 'accepted');

      if (!friendships?.length) return [];

      const friendIds = friendships.map(f => 
        f.sender_id === profile.id ? f.receiver_id : f.sender_id
      );

      // Get friends who liked this post
      const { data: likes } = await supabase
        .from('likes')
        .select(`
          user_id,
          profiles:user_id(id, username, avatar_url)
        `)
        .eq('post_id', postId)
        .in('user_id', friendIds)
        .limit(5);

      return (likes || [])
        .map(l => l.profiles)
        .filter((p): p is FriendLike => p !== null);
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  if (!friendLikes?.length) return null;

  const displayedFriends = friendLikes.slice(0, 3);
  const remainingCount = friendLikes.length - 3;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        'flex items-center gap-1.5 text-xs text-muted-foreground',
        className
      )}
    >
      <div className="flex items-center">
        {displayedFriends.map((friend, index) => (
          <FriendAvatarSmall key={friend.id} friend={friend} index={index} />
        ))}
      </div>
      <span className="flex items-center gap-1">
        <Heart className="h-3 w-3 fill-pink-500 text-pink-500" />
        {friendLikes.length === 1 
          ? `${displayedFriends[0].username} liked`
          : remainingCount > 0
            ? `${displayedFriends[0].username} +${friendLikes.length - 1} friends`
            : `${friendLikes.length} friends liked`
        }
      </span>
    </motion.div>
  );
});

export default FriendsAlsoLiked;
