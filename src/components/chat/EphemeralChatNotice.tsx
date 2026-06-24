import { Clock, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/hooks/useMessages';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface EphemeralChatNoticeProps {
  viewMode: ViewMode;
  isGroupChat?: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
}

const VIEW_MODE_OPTIONS: { id: ViewMode; label: string; hint: string }[] = [
  { id: '24h', label: '24 Hours After Viewing', hint: 'Snaps delete a day after they are opened' },
  { id: 'view_once', label: 'Immediately After Viewing', hint: 'Disappears right after it is seen' },
  { id: 'permanent', label: 'Keep Forever', hint: 'Messages stay in the chat' },
];

/** Snapchat-style ephemeral mode chip — tap to change how new messages delete. */
export function EphemeralChatNotice({
  viewMode,
  isGroupChat,
  onViewModeChange,
  className,
}: EphemeralChatNoticeProps) {
  const active = VIEW_MODE_OPTIONS.find((o) => o.id === viewMode) ?? VIEW_MODE_OPTIONS[0]!;

  return (
    <div className={cn('flex flex-col items-center px-4 py-3 text-center', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-gradient-to-r from-primary/15 via-card/80 to-accent/15 px-4 py-2.5 text-[11px] font-semibold text-foreground shadow-[0_4px_24px_hsl(var(--primary)/0.12)] backdrop-blur-md transition-transform active:scale-[0.98] hover:border-primary/40"
            aria-label="Change how messages delete"
          >
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>{active.label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          side="top"
          className="w-72 p-2 rounded-2xl border-border/40 bg-popover/95 backdrop-blur-xl"
        >
          <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {isGroupChat ? 'Group delete timer' : 'Delete timer for new messages'}
          </p>
          <div className="space-y-1">
            {VIEW_MODE_OPTIONS.map((option) => {
              const selected = viewMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onViewModeChange(option.id)}
                  className={cn(
                    'w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'bg-primary/15 border border-primary/30'
                      : 'hover:bg-muted/60 border border-transparent',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{option.label}</span>
                    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{option.hint}</p>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
