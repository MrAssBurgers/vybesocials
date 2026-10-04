import { useState } from 'react';
import { Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSharedThemeById } from '@/hooks/useSharedThemes';
import { ThemePreviewCanvas } from '@/components/themes/ThemePreviewCanvas';
import { ReceivedThemeSheet } from '@/components/themes/ReceivedThemeSheet';
import type { ThemeTokens } from '@/hooks/useCustomTheme';

interface SharedThemeMessageBubbleProps {
  sharedThemeId: string;
  isOwn: boolean;
  senderUsername?: string;
}

export function SharedThemeMessageBubble({
  sharedThemeId,
  isOwn,
  senderUsername,
}: SharedThemeMessageBubbleProps) {
  const [open, setOpen] = useState(false);
  const { data: theme, isLoading, isFetching, isError, refetch } = useSharedThemeById(sharedThemeId);

  return (
    <>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (isError) void refetch();
          else if (theme) setOpen(true);
        }}
        disabled={!theme && !isError}
        className={cn(
          'group flex items-center gap-3 p-2.5 pr-4 rounded-2xl max-w-[260px] active:scale-[0.98] transition-transform',
          'border border-border/40 bg-card',
          isOwn ? 'rounded-br-md' : 'rounded-bl-md'
        )}
      >
        {/* Mini preview tile */}
        <div className="h-14 w-14 shrink-0">
          {theme ? (
            <ThemePreviewCanvas
              tokens={theme.theme_tokens as ThemeTokens}
              size="sm"
              className="h-14 w-14"
            />
          ) : (
            <div className={cn('h-14 w-14 rounded-xl bg-muted/30', (isLoading || isFetching) && 'animate-pulse')} />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            <Palette className="h-3 w-3" />
            VYBE Theme
          </div>
          <p className="text-sm font-semibold truncate mt-0.5">
            {isLoading || isFetching ? 'Loading…' : isError ? 'Could not load · Retry' : theme?.theme_name || 'Theme unavailable'}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {theme ? 'Tap to preview · Equip' : senderUsername ? `from @${senderUsername}` : ' '}
          </p>
        </div>
      </button>

      <ReceivedThemeSheet open={open} theme={theme || null} onClose={() => setOpen(false)} />
    </>
  );
}
