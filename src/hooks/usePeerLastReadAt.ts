import { useEffect, useState } from 'react';
import { documentRef, onSnapshot } from '@/lib/firebase/firestoreDb';

/**
 * Live peer read cursor for Snapchat-style delivered/opened receipts (1:1 DMs).
 */
export function usePeerLastReadAt(
  conversationId: string | undefined,
  peerProfileId: string | undefined,
): string | null {
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId || !peerProfileId) {
      setLastReadAt(null);
      return;
    }

    const docId = `${conversationId}_${peerProfileId}`;
    return onSnapshot(
      documentRef('conversation_members', docId),
      (snap) => {
        if (!snap.exists()) {
          setLastReadAt(null);
          return;
        }
        const ts = snap.data()?.last_read_at;
        setLastReadAt(typeof ts === 'string' ? ts : null);
      },
      () => setLastReadAt(null),
    );
  }, [conversationId, peerProfileId]);

  return lastReadAt;
}
