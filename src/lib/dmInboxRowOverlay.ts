import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { DMConversationPreview } from '@/features/dms/dm.types';

export interface DmInboxRowLiveOverlay {
  isTyping?: boolean;
  presenceActivity?: ActivityType;
}

export function applyDmInboxRowLiveOverlay(
  preview: DMConversationPreview,
  overlay: DmInboxRowLiveOverlay,
): DMConversationPreview {
  const typing = overlay.isTyping ?? false;
  const activity = overlay.presenceActivity;
  const isOnline = Boolean(activity && activity !== 'idle');

  if (
    typing === preview.isTyping &&
    activity === preview.presenceActivity &&
    isOnline === preview.isOnline
  ) {
    return preview;
  }

  return {
    ...preview,
    isTyping: typing,
    presenceActivity: activity,
    isOnline,
    presenceState: isOnline ? 'online' : 'offline',
    statusLine: typing ? 'Typing…' : preview.statusLine,
  };
}
