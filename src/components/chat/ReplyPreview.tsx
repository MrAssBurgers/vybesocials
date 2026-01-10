import { memo } from 'react';
import { X, CornerUpLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReplyPreviewProps {
  senderName: string;
  content: string | null;
  mediaType?: string | null;
  onCancel: () => void;
}

export const ReplyPreview = memo(function ReplyPreview({
  senderName,
  content,
  mediaType,
  onCancel,
}: ReplyPreviewProps) {
  const getContentPreview = () => {
    if (content) return content;
    if (mediaType === 'image') return '📷 Photo';
    if (mediaType === 'gif') return 'GIF';
    if (mediaType === 'audio') return '🎤 Voice message';
    if (mediaType === 'video') return '🎬 Video';
    return 'Message';
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-muted/50 rounded-xl border-l-4 border-primary animate-in slide-in-from-bottom-2 duration-200">
      <CornerUpLeft className="h-4 w-4 text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-primary font-semibold leading-tight">
          Replying to {senderName}
        </p>
        <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
          {getContentPreview()}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-shrink-0 rounded-full hover:bg-destructive/10"
        onClick={onCancel}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
});
