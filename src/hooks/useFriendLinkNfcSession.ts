import { useEffect, useRef } from 'react';
import {
  startFriendLinkNfcSession,
  type FriendLinkTarget,
} from '@/lib/friendLinkNfc';
import { dbgFriendLink } from '@/lib/friendLinkDebug';

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
    if (!enabled || !broadcastUrl) {
      dbgFriendLink('H1', 'useFriendLinkNfcSession.ts', 'nfc_session_skipped', {
        enabled,
        hasUrl: !!broadcastUrl,
      });
      return;
    }

    dbgFriendLink('H1', 'useFriendLinkNfcSession.ts', 'nfc_session_start', {
      urlLen: broadcastUrl.length,
      nativeBroadcast,
    });

    const ac = new AbortController();
    let stop: (() => void) | undefined;

    void startFriendLinkNfcSession({
      broadcastUrl,
      signal: ac.signal,
      nativeBroadcast,
      onTarget: (target) => {
        dbgFriendLink('H2', 'useFriendLinkNfcSession.ts', 'nfc_target', {
          type: target.type,
          idLen: target.id.length,
        });
        onTargetRef.current(target);
      },
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
