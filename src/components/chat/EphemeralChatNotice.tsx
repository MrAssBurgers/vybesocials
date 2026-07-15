import { Clock, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/hooks/useMessages';
import { MEDIA_MODE_LABELS, type MediaAccessMode } from '@/lib/dmMediaRules';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface EphemeralChatNoticeProps {
  viewMode: ViewMode;
  isGroupChat?: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
  compact?: boolean;
}

const VIEW_MODE_OPTIONS: { id: ViewMode; label: string; short: string; hint: string }[] = [
  { id: '24h', label: MEDIA_MODE_LABELS.timed, short: '24 hours', hint: 'Unsaved messages delete 24 hours after send' },
  { id: 'on_close', label: MEDIA_MODE_LABELS.on_close, short: 'When I leave', hint: 'Unsaved vanish the moment you close the chat' },
  { id: 'view_once', label: MEDIA_MODE_LABELS.view_once, short: 'After viewing', hint: 'Disappears once seen (keep manually saved)' },
  { id: 'replay_once', label: MEDIA_MODE_LABELS.replay_once, short: 'Replay once', hint: 'One extra replay allowed' },
  { id: 'keep', label: MEDIA_MODE_LABELS.keep, short: 'Keep in chat', hint: 'Stays until you delete' },
  { id: 'permanent', label: MEDIA_MODE_LABELS.permanent, short: 'Keep forever', hint: 'Messages stay in chat' },
];

/** Slim delete-timer chip — tap to change (Snapchat-style). */
export function EphemeralChatNotice({
  viewMode,
  isGroupChat,
  onViewModeChange,
  className,
  compact = false,
}: EphemeralChatNoticeProps) {
  const active = VIEW_MODE_OPTIONS.find((o) => o.id === viewMode) ?? VIEW_MODE_OPTIONS[0]!;

  return (
    <div className={cn('dm-chat-header-timer', compact ? 'flex justify-center py-1' : 'flex justify-center px-4 py-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="dm-ephemeral-chip"
            aria-label="Change how messages delete"
          >
            <Clock className="h-3 w-3 shrink-0" />
            <span>{compact ? active.short : active.label}</span>
            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          side="bottom"
          className="w-64 p-1.5 rounded-xl border-border/50 bg-popover/98 backdrop-blur-xl shadow-xl"
        >
          <p className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {isGroupChat ? 'Group timer' : 'New message timer'}
          </p>
          <div className="space-y-0.5">
            {VIEW_MODE_OPTIONS.map((option) => {
              const selected = viewMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onViewModeChange(option.id)}
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                    selected ? 'bg-muted/80' : 'hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{option.label}</span>
                    {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{option.hint}</p>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
