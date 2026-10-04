import { memo, useState } from 'react';
import { ShieldAlert, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { cn } from '@/lib/utils';

interface ServerSafetyGateProps {
  mediaUrl: string;
  mediaType: 'image' | 'video' | string;
  className?: string;
}

/**
 * Wraps media in server channels with safety gating based on user's content_filter_level.
 * - protected: does not request media until the viewer chooses Reveal
 * - moderate: shows media without claiming a scan
 * - minimal: shows media directly
 */
export const ServerSafetyGate = memo(function ServerSafetyGate({
  mediaUrl,
  mediaType,
  className,
}: ServerSafetyGateProps) {
  const { data: settings } = useSafetySettings();
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const filterLevel = settings?.content_filter_level || 'protected';

  // Minimal - show directly
  if (filterLevel === 'minimal') {
    return (
      <MediaContent mediaUrl={mediaUrl} mediaType={mediaType} className={className} />
    );
  }

  // A blurred media element would still download the private URL immediately.
  if (filterLevel === 'protected' && revealedUrl !== mediaUrl) {
    return (
      <div className={cn("relative rounded-xl overflow-hidden", className)}>
        <div className="min-h-40 flex flex-col items-center justify-center gap-2 bg-card/95 p-4 text-center">
          <div className="h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-xs font-medium text-foreground">Content Hidden</p>
          <p className="text-[10px] text-muted-foreground max-w-[200px]">
            Your safety settings require approval before viewing media
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-7 text-xs rounded-lg gap-1.5"
            onClick={() => setRevealedUrl(mediaUrl)}
          >
            <Eye className="h-3 w-3" />
            Reveal
          </Button>
        </div>
      </div>
    );
  }

  return <MediaContent mediaUrl={mediaUrl} mediaType={mediaType} className={className} />;
});

function MediaContent({ mediaUrl, mediaType, className }: { mediaUrl: string; mediaType: string; className?: string }) {
  if (mediaType === 'video') {
    return (
      <video
        src={mediaUrl}
        controls
        className={cn("max-w-xs rounded-xl", className)}
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={mediaUrl}
      alt=""
      className={cn("max-w-xs rounded-xl", className)}
      loading="lazy"
    />
  );
}
