import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getOrCreateLocalKeyPair } from '@/lib/e2ee';

/**
 * Initialises E2EE keys for the current user:
 * 1. Ensures a local ECDH key pair exists in IndexedDB
 * 2. Publishes the public key to the encryption_keys table (keyed by profile.id)
 */
export function useInitEncryption() {
  const { profile } = useAuth();
  const initialised = useRef(false);

  useEffect(() => {
    if (!profile?.id || initialised.current) return;
    initialised.current = true;

    (async () => {
      try {
        const { publicKey } = await getOrCreateLocalKeyPair();

        // Upsert public key to DB using profile.id
        await supabase
          .from('encryption_keys' as any)
          .upsert(
            {
              user_id: profile.id,
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
  }, [profile?.id]);
}

/**
 * Fetches a user's public encryption key from the DB by profile ID
 */
export function usePublicKey(profileId: string | undefined) {
  return useQuery({
    queryKey: ['encryption-key', profileId],
    queryFn: async () => {
      if (!profileId) return null;

      const { data, error } = await supabase
        .from('encryption_keys' as any)
        .select('public_key')
        .eq('user_id', profileId)
        .maybeSingle();

      if (error) throw error;
      return (data as any)?.public_key as JsonWebKey | null;
    },
    enabled: !!profileId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetches public keys for multiple users (by profile ID) in a single query
 */
export function usePublicKeys(profileIds: string[]) {
  return useQuery({
    queryKey: ['encryption-keys', profileIds.sort().join(',')],
    queryFn: async () => {
      if (!profileIds.length) return {};

      const { data, error } = await supabase
        .from('encryption_keys' as any)
        .select('user_id, public_key')
        .in('user_id', profileIds);

      if (error) throw error;

      const map: Record<string, JsonWebKey> = {};
      (data as any[])?.forEach((row) => {
        map[row.user_id] = row.public_key;
      });
      return map;
    },
    enabled: profileIds.length > 0,
    staleTime: 5 * 60_000,
  });
}
