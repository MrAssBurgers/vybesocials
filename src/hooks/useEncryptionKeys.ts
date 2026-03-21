import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getOrCreateLocalKeyPair, exportPublicKey } from '@/lib/e2ee';

/**
 * Initialises E2EE keys for the current user:
 * 1. Ensures a local ECDH key pair exists in IndexedDB
 * 2. Publishes the public key to the encryption_keys table
 */
export function useInitEncryption() {
  const { user } = useAuth();
  const initialised = useRef(false);

  useEffect(() => {
    if (!user?.id || initialised.current) return;
    initialised.current = true;

    (async () => {
      try {
        const { publicKey } = await getOrCreateLocalKeyPair();

        // Upsert public key to DB
        await supabase
          .from('encryption_keys' as any)
          .upsert(
            {
              user_id: user.id,
              public_key: publicKey,
              key_algorithm: 'ECDH-P256',
              updated_at: new Date().toISOString(),
            } as any,
            { onConflict: 'user_id' }
          );
      } catch (err) {
        console.error('[E2EE] Key init failed:', err);
      }
    })();
  }, [user?.id]);
}

/**
 * Fetches a user's public encryption key from the DB
 */
export function usePublicKey(userId: string | undefined) {
  return useQuery({
    queryKey: ['encryption-key', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('encryption_keys' as any)
        .select('public_key')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return (data as any)?.public_key as JsonWebKey | null;
    },
    enabled: !!userId,
    staleTime: 5 * 60_000, // cache 5 min
  });
}

/**
 * Fetches public keys for multiple users in a single query
 */
export function usePublicKeys(userIds: string[]) {
  return useQuery({
    queryKey: ['encryption-keys', userIds.sort().join(',')],
    queryFn: async () => {
      if (!userIds.length) return {};

      const { data, error } = await supabase
        .from('encryption_keys' as any)
        .select('user_id, public_key')
        .in('user_id', userIds);

      if (error) throw error;

      const map: Record<string, JsonWebKey> = {};
      (data as any[])?.forEach((row) => {
        map[row.user_id] = row.public_key;
      });
      return map;
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60_000,
  });
}
