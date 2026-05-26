import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { ThemeTokens } from '@/hooks/useCustomTheme';

interface ThemePreviewCanvasProps {
  tokens: ThemeTokens | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  themeName?: string;
}

/**
 * Renders a self-contained mini preview of a theme using its tokens.
 * Uses inline HSL styles (not CSS vars) so it can preview ANY theme
 * without affecting the surrounding page.
 */
export const ThemePreviewCanvas = memo(function ThemePreviewCanvas({
  tokens,
  size = 'md',
  className,
  themeName,
}: ThemePreviewCanvasProps) {
  if (!tokens) {
    return (
      <div
        className={cn(
          'rounded-2xl bg-muted/30 animate-pulse',
          size === 'sm' && 'h-16 w-16',
          size === 'md' && 'h-32 w-full',
          size === 'lg' && 'h-48 w-full',
          className
        )}
      />
    );
  }

  const primary = `hsl(${tokens.colorPrimary})`;
  const secondary = `hsl(${tokens.colorSecondary})`;
  const accent = `hsl(${tokens.colorAccent})`;
  const bgMain = `hsl(${tokens.bgMain})`;
  const bgCard = `hsl(${tokens.bgCard})`;
  const gradFrom = `hsl(${tokens.bgGradientFrom || tokens.bgMain})`;
  const gradMid = `hsl(${tokens.bgGradientMid || tokens.bgCard})`;
  const gradTo = `hsl(${tokens.bgGradientTo || tokens.bgMain})`;
  const textPrimary = `hsl(${tokens.textPrimary})`;
  const textSecondary = `hsl(${tokens.textSecondary})`;
  const borderColor = `hsl(${tokens.borderColor || tokens.glassBorder || tokens.bgCard})`;

  if (size === 'sm') {
    // Compact tile for DM bubble or small cards
    return (
      <div
        className={cn('rounded-xl overflow-hidden relative shrink-0', className)}
        style={{
          background: `linear-gradient(135deg, ${gradFrom}, ${gradMid}, ${gradTo})`,
          border: `1px solid ${borderColor}`,
        }}
      >
        <div className="absolute inset-0 flex flex-col justify-end p-1.5 gap-1">
          <div className="flex gap-0.5">
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: primary }} />
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: secondary }} />
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          </div>
        </div>
        <div
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full blur-md opacity-70"
          style={{ background: primary }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden relative',
        size === 'md' && 'h-36',
        size === 'lg' && 'h-56',
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${gradFrom}, ${gradMid}, ${gradTo})`,
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Glow halos */}
      <div
        className="absolute -top-8 -left-8 h-32 w-32 rounded-full blur-3xl opacity-40 pointer-events-none"
        style={{ background: primary }}
      />
      <div
        className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full blur-3xl opacity-40 pointer-events-none"
        style={{ background: accent }}
      />

      {/* Mock mini UI */}
      <div className="relative h-full p-3 flex flex-col justify-between">
        {/* Top: chip with name */}
        <div className="flex items-center justify-between">
          <div
            className="px-2.5 py-1 rounded-full text-[10px] font-semibold truncate max-w-[60%]"
            style={{
              background: bgCard,
              color: textPrimary,
              border: `1px solid ${borderColor}`,
            }}
          >
            {themeName || tokens.themeName || 'VYBE Theme'}
          </div>
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full" style={{ background: primary }} />
            <div className="h-2 w-2 rounded-full" style={{ background: secondary }} />
            <div className="h-2 w-2 rounded-full" style={{ background: accent }} />
          </div>
        </div>

        {/* Middle: mock chat bubble */}
        <div className="flex flex-col gap-1.5">
          <div
            className="self-start rounded-2xl rounded-bl-md px-2.5 py-1.5 text-[10px] max-w-[70%]"
            style={{ background: bgCard, color: textSecondary }}
          >
            hey, check this VYBE
          </div>
          <div
            className="self-end rounded-2xl rounded-br-md px-2.5 py-1.5 text-[10px] max-w-[70%] font-medium"
            style={{ background: primary, color: tokens.buttonText ? `hsl(${tokens.buttonText})` : '#fff' }}
          >
            looks insane 🔥
          </div>
        </div>

        {/* Bottom: mock button */}
        <div className="flex items-center gap-2">
          <div
            className="flex-1 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              background: `linear-gradient(90deg, ${primary}, ${accent})`,
              color: tokens.buttonText ? `hsl(${tokens.buttonText})` : '#fff',
            }}
          >
            Equip
          </div>
        </div>
      </div>
    </div>
  );
});
