import { useState, useEffect, useRef, useCallback } from 'react';
import { getOrCreateLocalKeyPair, decryptMessage, isEncrypted } from '@/lib/e2ee';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Decrypts an array of messages in-place, caching keys.
 * Uses profile IDs (sender_id) to look up encryption keys.
 * 
 * IMPORTANT: With ECDH, the sender encrypts using (senderPrivate, recipientPublic).
 * The recipient decrypts using (recipientPrivate, senderPublic) — same shared secret.
 * But the sender CANNOT decrypt their own message because (senderPrivate, senderPublic)
 * produces a DIFFERENT shared secret. So we skip decryption for own messages.
 */
export function useDecryptedMessages<T extends { content: string | null; sender_id: string; id: string }>(
  messages: T[] | undefined
): { messages: T[]; decrypting: boolean } {
  const { profile } = useAuth();
  const [decrypted, setDecrypted] = useState<T[]>([]);
  const [decrypting, setDecrypting] = useState(false);
  const keyCache = useRef<Record<string, JsonWebKey | null>>({});
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const processedIds = useRef<Set<string>>(new Set());
  const plaintextCache = useRef<Record<string, string>>({});

  const decryptAll = useCallback(async (msgs: T[]) => {
    const myProfileId = profile?.id;
    const needsDecryption = msgs.some(m => 
      m.content && isEncrypted(m.content) && m.sender_id !== myProfileId
    );
    
    if (!needsDecryption) {
      // Still need to handle own encrypted messages — show plaintext from cache or strip prefix
      const result = msgs.map(m => {
        if (m.content && isEncrypted(m.content) && m.sender_id === myProfileId) {
          // Own message: use cached plaintext if available, otherwise show as-is without e2ee prefix
          const cached = plaintextCache.current[m.id];
          if (cached) return { ...m, content: cached };
          // If no cache (e.g. page reload), we can't decrypt our own message
          return { ...m, content: '🔒 Sent encrypted message' };
        }
        return m;
      });
      setDecrypted(result);
      return;
    }

    setDecrypting(true);
    try {
      if (!privateKeyRef.current) {
        const { privateKey } = await getOrCreateLocalKeyPair();
        privateKeyRef.current = privateKey;
      }

      // Collect unique sender IDs needing key lookup (exclude self)
      const senderIds = [...new Set(
        msgs
          .filter(m => m.content && isEncrypted(m.content) && m.sender_id !== myProfileId)
          .map(m => m.sender_id)
          .filter(id => !(id in keyCache.current))
      )];

      if (senderIds.length > 0) {
        const { data } = await supabase
          .from('encryption_keys' as any)
          .select('user_id, public_key')
          .in('user_id', senderIds);

        (data as any[])?.forEach(row => {
          keyCache.current[row.user_id] = row.public_key;
        });
        senderIds.forEach(id => {
          if (!(id in keyCache.current)) keyCache.current[id] = null;
        });
      }

      const result = await Promise.all(
        msgs.map(async (msg) => {
          if (!msg.content || !isEncrypted(msg.content)) return msg;

          // Own messages: can't decrypt with ECDH, use cache
          if (msg.sender_id === myProfileId) {
            const cached = plaintextCache.current[msg.id];
            if (cached) return { ...msg, content: cached };
            return { ...msg, content: '🔒 Sent encrypted message' };
          }

          const senderKey = keyCache.current[msg.sender_id];
          if (!senderKey) {
            return { ...msg, content: '🔒 Encrypted message' };
          }

          try {
            const plaintext = await decryptMessage(
              msg.content,
              privateKeyRef.current!,
              senderKey
            );
            // Cache decrypted content
            plaintextCache.current[msg.id] = plaintext;
            return { ...msg, content: plaintext };
          } catch {
            return { ...msg, content: '🔒 Encrypted message' };
          }
        })
      );

      setDecrypted(result);
    } catch (err) {
      console.error('[E2EE] Batch decryption error:', err);
      setDecrypted(msgs);
    } finally {
      setDecrypting(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!messages?.length) {
      setDecrypted([]);
      return;
    }

    // Cache plaintext for non-encrypted messages (including optimistic ones)
    messages.forEach(m => {
      if (m.content && !isEncrypted(m.content) && m.sender_id === profile?.id) {
        plaintextCache.current[m.id] = m.content;
      }
    });

    const hasNewMessages = messages.some(m => !processedIds.current.has(m.id));
    const hasContentChanges = messages.some(m => {
      const prev = decrypted.find(d => d.id === m.id);
      return prev && prev.content !== m.content;
    });
    
    if (!hasNewMessages && !hasContentChanges && decrypted.length === messages.length) return;
    
    messages.forEach(m => processedIds.current.add(m.id));

    decryptAll(messages);
  }, [messages, decryptAll, decrypted.length, profile?.id]);

  return { messages: decrypted.length ? decrypted : (messages || []), decrypting };
}
