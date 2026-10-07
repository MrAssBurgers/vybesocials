import { useEffect, useCallback, useState } from 'react';

// Global new post signal - listeners can subscribe
type NewPostListener = () => void;
const newPostListeners = new Set<NewPostListener>();

export function onNewPostAvailable(listener: NewPostListener) {
  newPostListeners.add(listener);
  return () => { newPostListeners.delete(listener); };
}

/**
 * Posts are not listenable as a collection. A member may read only their own
 * posts, so an unfiltered listener is denied for members and downloads every
 * post for staff. Home refreshes through the feed callables.
 */
export function usePostsRealtime() {
  return;
}

/**
 * Hook that tracks whether new posts are available (X-style banner).
 * Returns { hasNewPosts, clearNewPosts }
 */
export function useNewPostsBanner() {
  const [hasNewPosts, setHasNewPosts] = useState(false);
  
  useEffect(() => {
    return onNewPostAvailable(() => setHasNewPosts(true));
  }, []);
  
  const clearNewPosts = useCallback(() => setHasNewPosts(false), []);
  
  return { hasNewPosts, clearNewPosts };
}
