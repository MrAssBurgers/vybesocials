import type { MapLocationIntel } from './types';
import { invokeFunction } from '@/lib/firebase/functionsService';

export async function fetchLocationIntel(input: {
  latitude: number;
  longitude: number;
  placeName?: string;
  placeId?: string;
  forceRefresh?: boolean;
}): Promise<MapLocationIntel | null> {
  const { data, error } = await invokeFunction<{ intel: MapLocationIntel }>('research-map-location', {
    latitude: input.latitude,
    longitude: input.longitude,
    placeName: input.placeName,
    placeId: input.placeId,
    forceRefresh: input.forceRefresh,
  });
  if (error || !data?.intel) return null;
  return data.intel;
}

const DANGER_LABEL_TYPES = new Set([
  'trespassing',
  'private_property',
  'no_trespassing',
  'military_restricted',
  'closed_area',
]);

export function isDangerousLocation(intel: MapLocationIntel | null | undefined): boolean {
  if (!intel) return false;
  if (intel.verdict === 'avoid') return true;
  return intel.labels.some(
    (l) => l.severity === 'danger' && DANGER_LABEL_TYPES.has(String(l.type)),
  );
}

export function intelVerdictEmoji(verdict: MapLocationIntel['verdict']): string {
  switch (verdict) {
    case 'safe': return '✅';
    case 'caution': return '⚠️';
    case 'avoid': return '🚫';
    default: return '📍';
  }
}

export function safetyScoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}
