import { useMemo } from 'react';

/**
 * Check if today is a user's birthday based on their date_of_birth string.
 */
export function isTodayBirthday(dateOfBirth: string | null | undefined): boolean {
  if (!dateOfBirth) return false;
  try {
    const birth = new Date(dateOfBirth);
    const today = new Date();
    return birth.getMonth() === today.getMonth() && birth.getDate() === today.getDate();
  } catch {
    return false;
  }
}

/**
 * Hook that returns whether it's a user's birthday today.
 */
export function useIsBirthday(dateOfBirth: string | null | undefined): boolean {
  return useMemo(() => isTodayBirthday(dateOfBirth), [dateOfBirth]);
}
