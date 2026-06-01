import { useEffect, useRef } from 'react';
import {
  startFriendLinkNfcSession,
  type FriendLinkTarget,
} from '@/lib/friendLinkNfc';

interface UseFriendLinkNfcSessionOptions {
  enabled: boolean;
  broadcastUrl: string;
  onTarget: (target: FriendLinkTarget) => void;
}

/**
 * Keeps an NFC listen session alive while Friend Link tap mode is active.
 */
export function useFriendLinkNfcSession({
  enabled,
  broadcastUrl,
  onTarget,
}: UseFriendLinkNfcSessionOptions) {
  const onTargetRef = useRef(onTarget);
  onTargetRef.current = onTarget;

  useEffect(() => {
    if (!enabled || !broadcastUrl) return;

    const ac = new AbortController();
    let stop: (() => void) | undefined;

    void startFriendLinkNfcSession({
      broadcastUrl,
      signal: ac.signal,
      onTarget: (target) => onTargetRef.current(target),
    }).then((cleanup) => {
      stop = cleanup;
      if (ac.signal.aborted) cleanup();
    });

    return () => {
      ac.abort();
      stop?.();
    };
  }, [enabled, broadcastUrl]);
}
