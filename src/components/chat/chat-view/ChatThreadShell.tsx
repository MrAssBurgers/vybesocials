import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChatHeader, type ChatHeaderProps } from './ChatHeader';

export interface ChatThreadShellProps extends Omit<ChatHeaderProps, 'onBack'> {
  onBack: () => void;
  /** DOM id for the outer shell — chat screen shielding hooks into this. */
  shellId?: string;
  /** Per-conversation theme vars (`--dm-chat-wallpaper`, `--dm-bubble-sent`, etc). */
  themeStyle?: CSSProperties;
  className?: string;
  children: ReactNode;
}

/**
 * Outer layout wrapper for a conversation thread: the sticky compact header
 * (back / avatar / name / state + call / video / more) plus the flex column
 * that hosts the message list and composer. Extracted from ChatView so the
 * shell container + header markup live in one place — message list and
 * composer stay as ChatView children (send/realtime wiring untouched).
 */
export function ChatThreadShell({
  onBack,
  onOpenSearch,
  profileSlot,
  actionsSlot,
  viewMode,
  isGroupChat,
  onViewModeChange,
  shellId,
  themeStyle,
  className,
  children,
}: ChatThreadShellProps) {
  return (
    <div
      id={shellId}
      className={cn('flex flex-col h-full min-h-0 dm-chat-shell relative overflow-hidden', className)}
      style={{ touchAction: 'pan-y', ...themeStyle }}
    >
      <ChatHeader
        onBack={onBack}
        onOpenSearch={onOpenSearch}
        profileSlot={profileSlot}
        actionsSlot={actionsSlot}
        viewMode={viewMode}
        isGroupChat={isGroupChat}
        onViewModeChange={onViewModeChange}
      />
      {children}
    </div>
  );
}
