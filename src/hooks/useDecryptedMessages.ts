import { useState, useEffect, useRef, useCallback } from 'react';
import { getOrCreateLocalKeyPair, decryptMessage, isEncrypted } from '@/lib/e2ee';
import { supabase } from '@/integrations/supabase/client';

/**
 * Decrypts an array of messages in-place, caching keys.
 * Returns decrypted messages + loading state.
 */
export function useDecryptedMessages<T extends { content: string | null; sender_id: string }>(
  messages: T[] | undefined
): { messages: T[]; decrypting: boolean } {
  const [decrypted, setDecrypted] = useState<T[]>([]);
  const [decrypting, setDecrypting] = useState(false);
  const keyCache = useRef<Record<string, JsonWebKey | null>>({});
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const lastInput = useRef<string>('');

  const decryptAll = useCallback(async (msgs: T[]) => {
    // Check if any messages need decryption
    const needsDecryption = msgs.some(m => m.content && isEncrypted(m.content));
    if (!needsDecryption) {
      setDecrypted(msgs);
      return;
    }

    setDecrypting(true);
    try {
      // Get private key
      if (!privateKeyRef.current) {
        const { privateKey } = await getOrCreateLocalKeyPair();
        privateKeyRef.current = privateKey;
      }

      // Collect unique sender IDs that need keys
      const senderIds = [...new Set(
        msgs
          .filter(m => m.content && isEncrypted(m.content))
          .map(m => m.sender_id)
          .filter(id => !(id in keyCache.current))
      )];

      // Batch fetch missing keys
      if (senderIds.length > 0) {
        const { data } = await supabase
          .from('encryption_keys' as any)
          .select('user_id, public_key')
          .in('user_id', senderIds);

        (data as any[])?.forEach(row => {
          keyCache.current[row.user_id] = row.public_key;
        });
        // Mark missing ones as null
        senderIds.forEach(id => {
          if (!(id in keyCache.current)) keyCache.current[id] = null;
        });
      }

      // Decrypt all messages
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

    // Build a fingerprint to avoid re-processing unchanged data
    const fingerprint = messages.map(m => m.content?.slice(0, 20)).join('|');
    if (fingerprint === lastInput.current) return;
    lastInput.current = fingerprint;

    decryptAll(messages);
  }, [messages, decryptAll]);

  return { messages: decrypted.length ? decrypted : (messages || []), decrypting };
}
