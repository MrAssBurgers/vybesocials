import { memo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, ExternalLink, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { supabase } from '@/integrations/supabase/client';

interface SharedPostBubbleProps {
  postId: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
  caption?: string | null;
  isOwn: boolean;
  onNavigate?: (postId: string) => void;
}

/**
 * Instagram-style shared post bubble that displays as a clickable thumbnail.
 * When tapped, navigates to the video/post in the feed.
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
  const [postData, setPostData] = useState<{
    media_url: string | null;
    thumbnail_url: string | null;
    caption: string | null;
    type: string | null;
    author?: {
      username: string;
      avatar_url: string | null;
    };
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Fetch post data if not provided
  useEffect(() => {
    async function fetchPost() {
      if (!postId) {
        setIsLoading(false);
        setHasError(true);
        return;
      }

      // If we have media info, use it directly
      if (mediaUrl) {
        setPostData({
          media_url: mediaUrl,
          thumbnail_url: thumbnailUrl || null,
          caption: caption || null,
          type: mediaType || 'video',
        });
        setIsLoading(false);
        return;
      }

      // Fetch from database
      try {
        const { data, error } = await supabase
          .from('posts')
          .select(`
            id,
            media_url,
            thumbnail_url,
            caption,
            type,
            author:profiles!author_id(username, avatar_url)
          `)
          .eq('id', postId)
          .maybeSingle();

        if (error || !data) {
          console.error('Failed to fetch shared post:', error);
          setHasError(true);
        } else {
          setPostData({
            media_url: data.media_url,
            thumbnail_url: data.thumbnail_url,
            caption: data.caption,
            type: data.type,
            author: data.author as any,
          });
        }
      } catch (err) {
        console.error('Error fetching shared post:', err);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPost();
  }, [postId, mediaUrl, thumbnailUrl, caption, mediaType]);

  // Get signed URLs for media
  const signedMediaUrl = useSignedUrl(postData?.media_url || null);
  const signedThumbnailUrl = useSignedUrl(postData?.thumbnail_url || null);

  const isVideo = postData?.type === 'video' || postData?.type === 'short' || mediaType === 'video';
  
  const handleClick = () => {
    if (onNavigate) {
      onNavigate(postId);
    } else {
      // Navigate to post detail or shorts view
      if (isVideo && postData?.type === 'short') {
        navigate(`/shorts?startId=${postId}`);
      } else {
        navigate(`/p/${postId}`);
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="w-36 sm:w-44 aspect-square rounded-2xl bg-muted/50 animate-pulse flex items-center justify-center">
        <Film className="h-6 w-6 text-muted-foreground/50" />
      </div>
    );
  }

  // Error state - post not found or deleted
  if (hasError || !postData) {
    return (
      <div className="w-36 sm:w-44 aspect-square rounded-2xl bg-muted/30 border border-border/50 flex flex-col items-center justify-center gap-2 p-4">
        <Film className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground text-center">Post unavailable</p>
      </div>
    );
  }

  // Determine which image to show
  const displayUrl = signedThumbnailUrl || signedMediaUrl;

  return (
    <motion.button
      onClick={handleClick}
      className={cn(
        "relative overflow-hidden rounded-2xl group cursor-pointer",
        "w-36 sm:w-44 aspect-square",
        "bg-black/90 border border-border/30",
        "active:scale-[0.98] transition-transform"
      )}
      whileTap={{ scale: 0.98 }}
    >
      {/* Thumbnail/Preview */}
      {displayUrl ? (
        isVideo && signedMediaUrl && !signedThumbnailUrl ? (
          // Video thumbnail from video element
          <video
            src={signedMediaUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          // Image thumbnail
          <img
            src={displayUrl}
            alt="Shared post"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )
      ) : (
        // Fallback gradient
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

      {/* Play button for videos */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center",
              "bg-white/90 shadow-lg",
              "group-hover:bg-white transition-colors"
            )}
          >
            <Play className="h-6 w-6 text-black ml-0.5" fill="black" />
          </motion.div>
        </div>
      )}

      {/* Clip badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm">
        <Film className="h-3 w-3 text-white" />
        <span className="text-[10px] font-medium text-white">Clip</span>
      </div>

      {/* External link indicator */}
      <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink className="h-3 w-3 text-white" />
      </div>

      {/* Caption preview */}
      {postData.caption && (
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <p className="text-xs text-white font-medium line-clamp-2 drop-shadow-lg">
            {postData.caption}
          </p>
        </div>
      )}

      {/* "Tap to view" hint */}
      <div className="absolute bottom-0 left-0 right-0 p-2 pt-6 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-white/80 text-center font-medium">Tap to view</p>
      </div>
    </motion.button>
  );
});
