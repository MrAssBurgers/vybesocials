import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Listings updates now rely on React Query's refetchOnWindowFocus 
 * and staleTime instead of a dedicated realtime channel.
 * This reduces database connection pool usage.
 */
export function useRealtimeListings() {
  // No-op — listings rely on query refetching now.
  // Keeping the hook to avoid breaking imports.
}
