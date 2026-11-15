import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  url: string;
  mediaType: 'image' | 'video' | 'gif' | null;
  className?: string;
}

export function AnnouncementMediaPreview({ url, mediaType, className = '' }: Props) {
  if (!url) return null;
  return <Media key={`${mediaType}:${url}`} url={url} mediaType={mediaType} className={className} />;
}

function Media({ url, mediaType, className }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div role="status" className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
    <p className="text-sm text-muted-foreground">This announcement's media couldn't load.</p>
    <Button type="button" variant="outline" className="min-h-11" onClick={() => setFailed(false)}>Retry announcement media</Button>
  </div>;
  // Converted uploads are actual GIF files. Retain looping playback for older
  // records that explicitly point to a video file while labelled as a GIF.
  const isVideo = mediaType === 'video' || mediaType === 'gif' && /\.(?:mp4|webm|m4v|mov|ogv)(?:$|[?#])/i.test(url);
  if (isVideo) {
    return (
      <video
        src={url}
        controls={mediaType === 'video'}
        loop={mediaType === 'gif'}
        aria-label={mediaType === 'gif' ? 'Announcement animation' : 'Announcement video'}
        muted
        autoPlay
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        className={`w-full rounded-2xl object-cover ${className}`}
      />
    );
  }

  return (
    <img
      src={url}
      alt={mediaType === 'gif' ? 'Announcement animation' : 'Announcement image'}
      decoding="async"
      className={`w-full rounded-2xl object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
