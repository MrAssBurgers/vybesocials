/**
 * Invoke Firebase Cloud Functions with Supabase-compatible `{ body }` shape.
 * Fail-soft: returns null data instead of throwing when function is missing or stubbed.
 */
import { db } from '@/lib/firebase';

export interface EdgeFeatureResult<T> {
  data: T | null;
  unavailable: boolean;
  errorMessage?: string;
}

function isStubPayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return obj.error === 'not_yet_ported' || obj.ok === false;
}

export async function invokeEdgeFeature<T = Record<string, unknown>>(
  name: string,
  body?: Record<string, unknown>,
): Promise<EdgeFeatureResult<T>> {
  try {
    const { data, error } = await db.functions.invoke<T>(name, { body });
    if (error) {
      return { data: null, unavailable: true, errorMessage: error.message };
    }
    if (isStubPayload(data)) {
      return { data: null, unavailable: true, errorMessage: 'Feature not available yet' };
    }
    return { data: data ?? null, unavailable: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return { data: null, unavailable: true, errorMessage: message };
  }
}

export const EDGE_UNAVAILABLE_TOAST = 'This feature is coming soon — try again after the next update.';
