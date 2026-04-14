import { useMemo } from 'react';
import { useVybeDNA } from '@/hooks/useVybeDNA';
import { computeDNAPerks, type DNAPerkValues } from '@/lib/dnaPerks';

/**
 * Hook to get the current user's active DNA perks.
 * Returns computed perk multipliers that are wired into real systems.
 */
export function useDNAPerks(userId?: string) {
  const { data: dna } = useVybeDNA(userId);

  return useMemo((): DNAPerkValues => {
    const pv = dna?.personality_vector || { activity: 0.15, social: 0.1, creative: 0.1 };
    return computeDNAPerks(pv);
  }, [dna?.personality_vector]);
}
