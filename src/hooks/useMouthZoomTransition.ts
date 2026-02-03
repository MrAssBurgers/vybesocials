import { useCallback, useRef } from 'react';
import { useChatPrefetch } from './useChatPrefetch';

/**
 * Hook to enable hover-based prefetching for notification cards
 * This ensures chat data is ready before the user even taps
 */
export function useNotificationHoverPrefetch() {
  const { prefetchConversation } = useChatPrefetch();
  const prefetchedRef = useRef<Set<string>>(new Set());

  const onHover = useCallback((userId: string) => {
    // Only prefetch once per user
    if (prefetchedRef.current.has(userId)) return;
    prefetchedRef.current.add(userId);
    
    // Start prefetching in background
    prefetchConversation(userId);
  }, [prefetchConversation]);

  const onFocus = useCallback((userId: string) => {
    onHover(userId);
  }, [onHover]);

  return { onHover, onFocus };
}
