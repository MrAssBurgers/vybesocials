import { memo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
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
 * Clean video bubble for shared clips - just thumbnail with title at bottom.
 * No extra backgrounds, minimal, Instagram-style.
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
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch post data if not provided
  useEffect(() => {
    async function fetchPost() {
      if (!postId) {
        setIsLoading(false);
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
          .select('id, media_url, thumbnail_url, caption, type')
          .eq('id', postId)
          .maybeSingle();

        if (!error && data) {
          setPostData({
            media_url: data.media_url,
            thumbnail_url: data.thumbnail_url,
            caption: data.caption,
            type: data.type,
          });
        }
      } catch (err) {
        console.error('Error fetching shared post:', err);
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
      <div className="w-40 aspect-[4/5] rounded-2xl bg-muted/50 animate-pulse" />
    );
  }

  // No data - don't render anything broken
  if (!postData) return null;

  // Determine which image to show
  const displayUrl = signedThumbnailUrl || signedMediaUrl;
  
  // Get title from caption (first line, truncated)
  const videoTitle = postData.caption 
    ? postData.caption.split('\n')[0].slice(0, 50) + (postData.caption.length > 50 ? '...' : '')
    : null;

  return (
    <motion.button
      onClick={handleClick}
      className="relative overflow-hidden rounded-2xl w-40 aspect-[4/5] bg-black active:scale-[0.98] transition-transform"
      whileTap={{ scale: 0.98 }}
    >
      {/* Thumbnail */}
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
        <div className="absolute inset-0 bg-muted/30" />
      )}

      {/* Play button for videos */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Play className="h-5 w-5 text-white ml-0.5" fill="white" />
          </div>
        </div>
      )}

      {/* Title at bottom */}
      {videoTitle && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-2.5 px-2.5">
          <p className="text-[11px] text-white font-medium line-clamp-2 text-left leading-tight">
            {videoTitle}
          </p>
        </div>
      )}
    </motion.button>
  );
});
