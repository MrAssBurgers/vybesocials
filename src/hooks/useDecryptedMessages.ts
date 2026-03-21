import { useState, useEffect, useRef, useCallback } from 'react';
import { getOrCreateLocalKeyPair, decryptMessage, isEncrypted } from '@/lib/e2ee';
import { supabase } from '@/integrations/supabase/client';

/**
 * Decrypts an array of messages in-place, caching keys.
 * Uses profile IDs (sender_id) to look up encryption keys.
 */
export function useDecryptedMessages<T extends { content: string | null; sender_id: string; id: string }>(
  messages: T[] | undefined
): { messages: T[]; decrypting: boolean } {
  const [decrypted, setDecrypted] = useState<T[]>([]);
  const [decrypting, setDecrypting] = useState(false);
  const keyCache = useRef<Record<string, JsonWebKey | null>>({});
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const processedIds = useRef<Set<string>>(new Set());

  const decryptAll = useCallback(async (msgs: T[]) => {
    const needsDecryption = msgs.some(m => m.content && isEncrypted(m.content));
    if (!needsDecryption) {
      setDecrypted(msgs);
      return;
    }

    setDecrypting(true);
    try {
      if (!privateKeyRef.current) {
        const { privateKey } = await getOrCreateLocalKeyPair();
        privateKeyRef.current = privateKey;
      }

      // Collect unique sender IDs needing key lookup
      const senderIds = [...new Set(
        msgs
          .filter(m => m.content && isEncrypted(m.content))
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
  }, []);

  useEffect(() => {
    if (!messages?.length) {
      setDecrypted([]);
      return;
    }

    // Check if messages changed (new messages added)
    const currentIds = messages.map(m => m.id).join(',');
    const hasNewMessages = messages.some(m => !processedIds.current.has(m.id));
    
    if (!hasNewMessages && decrypted.length === messages.length) return;
    
    // Track processed IDs
    messages.forEach(m => processedIds.current.add(m.id));

    decryptAll(messages);
  }, [messages, decryptAll, decrypted.length]);

  return { messages: decrypted.length ? decrypted : (messages || []), decrypting };
}
