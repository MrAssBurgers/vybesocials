import { memo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface SharedPostBubbleProps {
  postId: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
  caption?: string | null;
  isOwn: boolean;
  onNavigate?: (postId: string) => void;
}

interface PostWithAuthor {
  media_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  type: string | null;
  author_id: string | null;
  author_username: string | null;
  author_avatar: string | null;
}

/**
 * Instagram Reels-style bubble for shared clips in DMs.
 * Features 9:16 aspect ratio, creator overlay, and "Clip" badge.
 */
export const SharedPostBubble = memo(function SharedPostBubble({
  postId,
  mediaUrl,
  thumbnailUrl,
  mediaType,
  caption,
  isOwn,
  onNavigate,
}: SharedPostBubbleProps) {
  const navigate = useNavigate();
  const [postData, setPostData] = useState<PostWithAuthor | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch post data with author info
  useEffect(() => {
    async function fetchPost() {
      if (!postId) {
        setIsLoading(false);
        return;
      }

      // If we have media info, still need to fetch author data
      try {
        const { data, error } = await supabase
          .from('posts')
          .select(`
            id, 
            media_url, 
            thumbnail_url, 
            caption, 
            type,
            author_id,
            profiles!posts_author_id_fkey (
              id,
              username,
              avatar_url
            )
          `)
          .eq('id', postId)
          .maybeSingle();

        if (!error && data) {
          const profile = data.profiles as { id: string; username: string; avatar_url: string | null } | null;
          setPostData({
            media_url: mediaUrl || data.media_url,
            thumbnail_url: thumbnailUrl || data.thumbnail_url,
            caption: caption || data.caption,
            type: mediaType || data.type,
            author_id: profile?.id || null,
            author_username: profile?.username || null,
            author_avatar: profile?.avatar_url || null,
          });
        } else if (mediaUrl) {
          // Fallback if can't fetch from DB but have media
          setPostData({
            media_url: mediaUrl,
            thumbnail_url: thumbnailUrl || null,
            caption: caption || null,
            type: mediaType || 'video',
            author_id: null,
            author_username: null,
            author_avatar: null,
          });
        }
      } catch (err) {
        console.error('Error fetching shared post:', err);
        // Fallback to provided props
        if (mediaUrl) {
          setPostData({
            media_url: mediaUrl,
            thumbnail_url: thumbnailUrl || null,
            caption: caption || null,
            type: mediaType || 'video',
            author_id: null,
            author_username: null,
            author_avatar: null,
          });
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchPost();
  }, [postId, mediaUrl, thumbnailUrl, caption, mediaType]);

  // Get signed URLs for media
  const signedMediaUrl = useSignedUrl(postData?.media_url || null);
  const signedThumbnailUrl = useSignedUrl(postData?.thumbnail_url || null);
  const signedAvatarUrl = useSignedUrl(postData?.author_avatar || null);

  const isVideo = postData?.type === 'video' || postData?.type === 'short' || mediaType === 'video';
  
  const handleClick = () => {
    if (onNavigate) {
      onNavigate(postId);
    } else {
      if (isVideo && postData?.type === 'short') {
        navigate(`/shorts?startId=${postId}`);
      } else {
        navigate(`/p/${postId}`);
      }
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="w-36 aspect-[9/16] rounded-2xl bg-muted/50 animate-pulse" />
    );
  }

  // No data - don't render anything broken
  if (!postData) return null;

  // Determine which image to show
  const displayUrl = signedThumbnailUrl || signedMediaUrl;
  
  // Get title from caption (first line, truncated)
  const videoTitle = postData.caption 
    ? postData.caption.split('\n')[0].slice(0, 40) + (postData.caption.length > 40 ? '...' : '')
    : null;

  return (
    <motion.button
      onClick={handleClick}
      className={cn(
        "relative overflow-hidden rounded-2xl w-36 aspect-[9/16]",
        "bg-black shadow-lg shadow-black/20",
        "active:scale-[0.98] transition-transform"
      )}
      whileTap={{ scale: 0.98 }}
    >
      {/* Thumbnail / Video preview */}
      {displayUrl ? (
        isVideo && signedMediaUrl && !signedThumbnailUrl ? (
          <video
            src={signedMediaUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={displayUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted/40 to-muted/20" />
      )}

      {/* Top gradient for creator info */}
      <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/60 via-black/30 to-transparent" />

      {/* Creator info overlay - top left */}
      {postData.author_username && (
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <Avatar className="h-6 w-6 ring-1 ring-white/30">
            <AvatarImage src={signedAvatarUrl || undefined} className="object-cover" />
            <AvatarFallback className="bg-white/20 text-white text-[10px] font-semibold">
              {postData.author_username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-white font-medium drop-shadow-sm truncate max-w-[80px]">
            @{postData.author_username}
          </span>
        </div>
      )}

      {/* "Clip" badge - top right */}
      {isVideo && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm">
          <Film className="h-3 w-3 text-white" />
          <span className="text-[10px] text-white font-semibold">Clip</span>
        </div>
      )}

      {/* Play button for videos - center */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div 
            whileHover={{ scale: 1.1 }}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-sm shadow-lg"
          >
            <Play className="h-6 w-6 text-white ml-0.5" fill="white" />
          </motion.div>
        </div>
      )}

      {/* Bottom gradient for title */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-12 pb-3 px-2.5">
        {videoTitle && (
          <p className="text-[11px] text-white font-medium line-clamp-2 text-left leading-tight drop-shadow-sm">
            {videoTitle}
          </p>
        )}
      </div>
    </motion.button>
  );
});
