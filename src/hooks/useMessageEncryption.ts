import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { encryptMessage, decryptMessage, getOrCreateLocalKeyPair, isEncrypted } from '@/lib/e2ee';

/**
 * Hook providing encrypt/decrypt helpers for DM conversations.
 * Uses profile IDs (not auth user IDs) since the chat system references profiles.
 * For group chats, encryption is skipped (requires different key management).
 */
export function useMessageEncryption() {
  const keyCache = useRef<Record<string, JsonWebKey>>({});
  const privateKeyRef = useRef<CryptoKey | null>(null);

  const getPrivateKey = useCallback(async () => {
    if (privateKeyRef.current) return privateKeyRef.current;
    const { privateKey } = await getOrCreateLocalKeyPair();
    privateKeyRef.current = privateKey;
    return privateKey;
  }, []);

  const getRecipientPublicKey = useCallback(async (profileId: string): Promise<JsonWebKey | null> => {
    if (keyCache.current[profileId]) return keyCache.current[profileId];

    const { data, error } = await supabase
      .from('encryption_keys' as any)
      .select('public_key')
      .eq('user_id', profileId)
      .maybeSingle();

    if (error || !data) return null;
    const key = (data as any).public_key as JsonWebKey;
    keyCache.current[profileId] = key;
    return key;
  }, []);

  /**
   * Encrypt message content for a 1:1 conversation.
   * recipientProfileId = the other person's profile.id
   */
  const encrypt = useCallback(async (
    content: string,
    recipientProfileId: string
  ): Promise<string> => {
    try {
      const [privateKey, recipientKey] = await Promise.all([
        getPrivateKey(),
        getRecipientPublicKey(recipientProfileId),
      ]);

      if (!recipientKey) {
        console.warn('[E2EE] Recipient has no public key, sending unencrypted');
        return content;
      }

      return await encryptMessage(content, privateKey, recipientKey);
    } catch (err) {
      console.error('[E2EE] Encryption failed, sending unencrypted:', err);
      return content;
    }
  }, [getPrivateKey, getRecipientPublicKey]);

  /**
   * Decrypt message content. senderProfileId = the sender's profile.id
   */
  const decrypt = useCallback(async (
    content: string | null,
    senderProfileId: string
  ): Promise<string | null> => {
    if (!content || !isEncrypted(content)) return content;

    try {
      const [privateKey, senderKey] = await Promise.all([
        getPrivateKey(),
        getRecipientPublicKey(senderProfileId),
      ]);

      if (!senderKey) {
        return '🔒 Encrypted message (key unavailable)';
      }

      return await decryptMessage(content, privateKey, senderKey);
    } catch (err) {
      console.error('[E2EE] Decryption failed:', err);
      return '🔒 Encrypted message';
    }
  }, [getPrivateKey, getRecipientPublicKey]);

  return { encrypt, decrypt, isEncrypted };
}
