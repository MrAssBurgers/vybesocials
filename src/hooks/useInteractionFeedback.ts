import { useCallback } from 'react';
import { triggerHaptic } from '@/lib/haptics';

/**
 * Centralized micro-interaction feedback for all engagement actions.
 */
export function useInteractionFeedback() {
  const onBookmark = useCallback(() => triggerHaptic('medium'), []);
  const onComment = useCallback(() => triggerHaptic('light'), []);
  const onShare = useCallback(() => triggerHaptic('medium'), []);
  const onFollow = useCallback(() => triggerHaptic('success'), []);
  const onSend = useCallback(() => triggerHaptic('medium'), []);

  return { onBookmark, onComment, onShare, onFollow, onSend };
}
