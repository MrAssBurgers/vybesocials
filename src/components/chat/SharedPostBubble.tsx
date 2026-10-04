import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Play, Image as ImageIcon } from 'lucide-react';
import { useSharedPostPreview } from './SharedPostPreviews';

interface SharedPostBubbleProps {
  postId: string;
  onNavigate?: (postId: string) => void;
}

/** Message snapshots cannot authorize media. Render only the current checked preview. */
export const SharedPostBubble = memo(function SharedPostBubble({ postId, onNavigate }: SharedPostBubbleProps) {
  const navigate = useNavigate();
  const { ref, entry, retry } = useSharedPostPreview(postId);
  const post = entry.post;
  const isVideo = post?.type === 'short' || post?.type === 'video';
  return <div ref={ref} className="w-40 overflow-hidden rounded-3xl border border-border/60 bg-card/80">
    {!post ? <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-4 text-center text-xs text-muted-foreground">
      <ImageIcon aria-hidden className="h-7 w-7 opacity-60" />
      <p role="status">{entry.status === 'error' ? 'Could not refresh this post.' : entry.status === 'unavailable' ? 'This post is unavailable.' : 'Checking shared post…'}</p>
      {entry.status === 'error' && <button type="button" className="rounded-full border border-border px-4 py-2 text-foreground" onClick={retry}>Retry preview</button>}
    </div> : <button type="button" aria-label={`Open shared ${isVideo ? 'video' : 'post'} by ${post.author.username}`} className="relative block w-full text-left" onClick={() => {
      if (onNavigate) onNavigate(postId);
      else navigate(isVideo ? `/clips/${postId}` : `/p/${postId}`);
    }}>
      <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-primary/10 via-card to-accent/10">
        {post.thumbnailUrl || (!isVideo && post.mediaUrl) ? <img src={post.thumbnailUrl || post.mediaUrl!} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center p-4"><p className="line-clamp-5 text-sm">{post.caption || 'Shared video'}</p></div>}
        {isVideo && <div className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-background/75 p-3 backdrop-blur-md"><Play aria-hidden className="h-6 w-6" /></span></div>}
      </div>
      <div className="space-y-1 p-3"><p className="truncate text-xs font-semibold">@{post.author.username}</p>{post.caption && <p className="line-clamp-2 text-xs text-muted-foreground">{post.caption}</p>}{isVideo && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Film aria-hidden className="h-3 w-3" />Video</span>}</div>
    </button>}
  </div>;
});
