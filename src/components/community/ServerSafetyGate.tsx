import { memo, useState } from 'react';
import { Shield, ShieldAlert, Eye, EyeOff, AlertTriangle } from 'lucide-react';
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
 * - protected: blurs all media, requires tap to reveal with warning
 * - moderate: shows media with a small safety indicator
 * - minimal: shows media directly
 */
export const ServerSafetyGate = memo(function ServerSafetyGate({
  mediaUrl,
  mediaType,
  className,
}: ServerSafetyGateProps) {
  const { data: settings } = useSafetySettings();
  const [revealed, setRevealed] = useState(false);
  const filterLevel = settings?.content_filter_level || 'moderate';

  // Minimal - show directly
  if (filterLevel === 'minimal') {
    return (
      <MediaContent mediaUrl={mediaUrl} mediaType={mediaType} className={className} />
    );
  }

  // Protected - always blur until revealed
  if (filterLevel === 'protected' && !revealed) {
    return (
      <div className={cn("relative rounded-xl overflow-hidden", className)}>
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-card/95 backdrop-blur-xl p-4 text-center">
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
            onClick={() => setRevealed(true)}
          >
            <Eye className="h-3 w-3" />
            Reveal
          </Button>
        </div>
        <div className="blur-2xl opacity-30 pointer-events-none">
          <MediaContent mediaUrl={mediaUrl} mediaType={mediaType} />
        </div>
      </div>
    );
  }

  // Moderate - show with safety badge
  return (
    <div className={cn("relative group", className)}>
      <MediaContent mediaUrl={mediaUrl} mediaType={mediaType} />
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-background/80 backdrop-blur-sm text-[9px] text-muted-foreground">
          <Shield className="h-2.5 w-2.5" />
          Scanned
        </div>
      </div>
    </div>
  );
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
