import { useEffect, useRef } from 'react';
import {
  startFriendLinkNfcSession,
  type FriendLinkTarget,
} from '@/lib/friendLinkNfc';

interface UseFriendLinkNfcSessionOptions {
  enabled: boolean;
  broadcastUrl: string;
  onTarget: (target: FriendLinkTarget) => void;
  /** Despia Android: also present our URL via deferred nfc://write for Phone Tap. */
  nativeBroadcast?: boolean;
}

/**
 * Keeps an NFC listen session alive while Friend Link tap mode is active.
 * Android also broadcasts our share URL so peer phones can receive a signal.
 */
export function useFriendLinkNfcSession({
  enabled,
  broadcastUrl,
  onTarget,
  nativeBroadcast = true,
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
      nativeBroadcast,
      onTarget: (target) => onTargetRef.current(target),
    }).then((cleanup) => {
      stop = cleanup;
      if (ac.signal.aborted) cleanup();
    });

    return () => {
      ac.abort();
      stop?.();
    };
  }, [enabled, broadcastUrl, nativeBroadcast]);
}
