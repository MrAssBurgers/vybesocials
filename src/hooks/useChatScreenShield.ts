import { useEffect } from 'react';
import { acquireChatScreenShield, releaseChatScreenShield } from '@/lib/chatScreenShield';

/** Enables OS-level + web blackout screenshot protection while mounted. */
export function useChatScreenShield(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    acquireChatScreenShield();
    return () => releaseChatScreenShield();
  }, [enabled]);
}
