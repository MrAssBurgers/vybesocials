import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Play, Laugh, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface FriendsReactedClipsProps {
  className?: string;
  limit?: number;
}

interface ReactedClip {
  id: string;
  thumbnail_url: string | null;
  media_url: string;
  friends: Array<{
    id: string;
    username: string;
    avatar_url: string | null;
  }>;
  reactionCount: number;
}

const ClipThumbnail = memo(function ClipThumbnail({ 
  clip 
}: { 
  clip: ReactedClip;
}) {
  const thumbnailUrl = useSignedUrl(clip.thumbnail_url || clip.media_url);
  const firstFriend = clip.friends[0];
  const friendAvatarUrl = useSignedUrl(firstFriend?.avatar_url);

  return (
    <Link to={`/p/${clip.id}`}>
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="relative aspect-[9/16] w-28 rounded-xl overflow-hidden bg-muted shrink-0"
      >
        {/* Thumbnail */}
        {thumbnailUrl ? (
          <img 
            src={thumbnailUrl} 
            alt="" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <Play className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Play indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            whileHover={{ scale: 1.1 }}
            className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
          >
            <Play className="h-5 w-5 text-white fill-white" />
          </motion.div>
        </div>

        {/* Friend reaction indicator */}
        <div className="absolute bottom-2 left-2 right-2">
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5 border border-white">
              <AvatarImage src={friendAvatarUrl || undefined} />
              <AvatarFallback className="text-[8px]">
                {firstFriend?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-0.5 text-white text-[10px]">
              <Laugh className="h-3 w-3" />
              <span className="font-medium truncate max-w-[60px]">
                {clip.friends.length === 1 
                  ? firstFriend?.username 
                  : `+${clip.friends.length}`
                }
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
});

export const FriendsReactedClips = memo(function FriendsReactedClips({ 
  className,
  limit = 6 
}: FriendsReactedClipsProps) {
  const { profile } = useAuth();

  const { data: clips, isLoading } = useQuery({
    queryKey: ['friends-reacted-clips', profile?.id, limit],
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

      // Get recent likes from friends on video posts (funny reactions)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: friendLikes } = await supabase
        .from('likes')
        .select(`
          post_id,
          user_id,
          created_at,
          profiles:user_id(id, username, avatar_url)
        `)
        .in('user_id', friendIds)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!friendLikes?.length) return [];

      // Group by post and get post details
      const postLikesMap = new Map<string, typeof friendLikes>();
      friendLikes.forEach(like => {
        if (!postLikesMap.has(like.post_id)) {
          postLikesMap.set(like.post_id, []);
        }
        postLikesMap.get(like.post_id)!.push(like);
      });

      // Sort by number of friend reactions
      const sortedPostIds = Array.from(postLikesMap.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, limit)
        .map(([postId]) => postId);

      if (!sortedPostIds.length) return [];

      // Get post details (videos/shorts only)
      const { data: posts } = await supabase
        .from('posts')
        .select('id, media_url, thumbnail_url, type')
        .in('id', sortedPostIds)
        .in('type', ['video', 'short']);

      if (!posts?.length) return [];

      // Build final clips array
      return posts.map(post => ({
        id: post.id,
        thumbnail_url: post.thumbnail_url,
        media_url: post.media_url,
        friends: (postLikesMap.get(post.id) || [])
          .map(l => l.profiles)
          .filter((p): p is { id: string; username: string; avatar_url: string | null } => p !== null)
          .slice(0, 3),
        reactionCount: postLikesMap.get(post.id)?.length || 0,
      })).filter(c => c.friends.length > 0);
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !clips?.length) return null;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 px-4">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Friends reacted to
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2">
        {clips.map((clip) => (
          <ClipThumbnail key={clip.id} clip={clip} />
        ))}
      </div>
    </div>
  );
});

export default FriendsReactedClips;
