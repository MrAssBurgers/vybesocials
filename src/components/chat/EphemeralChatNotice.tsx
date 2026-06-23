import { Clock, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/hooks/useMessages';

interface EphemeralChatNoticeProps {
  viewMode: ViewMode;
  isGroupChat?: boolean;
  className?: string;
}

/** Snapchat-style centered ephemeral notice for DMs / group chats. */
export function EphemeralChatNotice({ viewMode, isGroupChat, className }: EphemeralChatNoticeProps) {
  if (viewMode !== '24h' && viewMode !== 'view_once') return null;

  const label =
    viewMode === 'view_once'
      ? 'Snaps delete immediately after viewing'
      : isGroupChat
        ? 'Chats with this group automatically delete: 24 Hours After Viewing'
        : 'Chats automatically delete: 24 Hours After Viewing';

  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-4 text-center', className)}>
      <p className="text-[11px] sm:text-xs text-muted-foreground/80 leading-relaxed max-w-sm">
        {label}
      </p>
      <div className="inline-flex items-center gap-2 rounded-full bg-muted/40 border border-border/30 px-4 py-2 text-[11px] font-semibold text-foreground/90">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{viewMode === 'view_once' ? 'Immediately After Viewing' : '24 Hours After Viewing'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
      </div>
    </div>
  );
}
