import type { MapLocationIntel } from './types';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { profileAccountGuard } from '@/lib/profileAccountGuard';

export type LocationIntelInput = {
  latitude: number;
  longitude: number;
  placeName?: string;
  placeId?: string;
  forceRefresh?: boolean;
};
export type LocationIntelRead = { intel: MapLocationIntel; validUntil: number };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value: unknown, max = 4000): value is string => typeof value === 'string' && value.length <= max;
const optionalText = (value: unknown) => value == null || boundedText(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
function checkedIntel(value: unknown): value is MapLocationIntel {
  return object(value) && typeof value.cache_key === 'string' && /^[a-f0-9]{64}$/.test(value.cache_key)
    && finite(value.latitude, -90, 90) && finite(value.longitude, -180, 180) && finite(value.safety_score, 0, 100)
    && ['safe', 'caution', 'avoid'].includes(String(value.verdict)) && boundedText(value.summary, 16000)
    && Array.isArray(value.labels) && value.labels.length <= 8 && value.labels.every(label => object(label)
      && boundedText(label.type) && boundedText(label.title) && boundedText(label.detail) && ['info', 'warning', 'danger'].includes(String(label.severity)))
    && Array.isArray(value.tips) && value.tips.length <= 6 && value.tips.every(tip => boundedText(tip))
    && ['place_name', 'access_notes', 'typical_hours', 'parking_notes', 'accessibility_notes', 'sources_note'].every(key => optionalText(value[key]))
    && date(value.researched_at) && date(value.expires_at) && Date.parse(value.expires_at) > Date.parse(value.researched_at);
}

/** A checked result is visible only for its current account, selection and short access lease. */
export async function fetchLocationIntel(actor: { uid: string; profileId: string }, input: LocationIntelInput, extraGuard: () => void): Promise<LocationIntelRead> {
  const guard = profileAccountGuard(actor.uid, extraGuard);
  const started = performance.now();
  let active = true, timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => { guard(); if (!active) throw new Error('This area information request ended. Please retry.'); };
  try {
    current();
    const { data, error } = await Promise.race([
      invokeFunction<unknown>('research-map-location', {
        expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId,
        ...(input.placeId ? { placeId: input.placeId } : { latitude: input.latitude, longitude: input.longitude, ...(input.placeName ? { placeName: input.placeName } : {}) }),
        ...(input.forceRefresh ? { forceRefresh: true } : {}),
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new Error('Area information took too long. Please retry.')); }, 15_000); }),
    ]);
    current();
    if (error) throw Object.assign(new Error(error.message || 'Area information could not be loaded. Please retry.'), { code: error.code || error.name });
    if (!object(data) || data.ok !== true || data.ownerUid !== actor.uid || data.profileId !== actor.profileId || data.placeId !== (input.placeId || null)
      || !finite(data.serverTime, 0, Number.MAX_SAFE_INTEGER) || !finite(data.validUntil, data.serverTime + 1, data.serverTime + 15_000)
      || !checkedIntel(data.intel) || Date.parse(data.intel.expires_at) <= data.serverTime
      || (!input.placeId && (data.intel.latitude !== input.latitude || data.intel.longitude !== input.longitude))) {
      throw new Error('Area information could not be confirmed. Please retry.');
    }
    const remaining = data.validUntil - data.serverTime - (performance.now() - started);
    if (remaining <= 0) throw new Error('Area information expired before it arrived. Please retry.');
    return { intel: data.intel, validUntil: Date.now() + remaining };
  } finally { active = false; if (timer) clearTimeout(timer); }
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
