/**
 * VybeMap Area Intelligence — Gemini + Google Search grounding for location safety research.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LocationLabelType =
  | 'trespassing'
  | 'private_property'
  | 'no_trespassing'
  | 'construction'
  | 'closed_area'
  | 'after_hours'
  | 'high_crime'
  | 'flood_zone'
  | 'wildfire_risk'
  | 'protected_wildlife'
  | 'military_restricted'
  | 'school_zone'
  | 'permit_required'
  | 'no_parking'
  | 'poorly_lit'
  | 'well_lit'
  | 'public_park'
  | 'business_district'
  | 'water_hazard';

export type LocationVerdict = 'safe' | 'caution' | 'avoid';

export interface LocationLabel {
  type: LocationLabelType | string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  detail: string;
}

export interface MapLocationIntel {
  cache_key: string;
  latitude: number;
  longitude: number;
  place_name?: string | null;
  safety_score: number;
  verdict: LocationVerdict;
  labels: LocationLabel[];
  summary: string;
  tips: string[];
  access_notes?: string | null;
  typical_hours?: string | null;
  parking_notes?: string | null;
  accessibility_notes?: string | null;
  sources_note?: string | null;
  researched_at: string;
  expires_at: string;
}

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpsError('failed-precondition', 'Area intelligence unavailable');
  return key;
}

/** ~110m grid cache key. */
export function intelCacheKey(lat: number, lng: number): string {
  const rLat = Math.round(lat * 1000) / 1000;
  const rLng = Math.round(lng * 1000) / 1000;
  return `${rLat}_${rLng}`;
}

async function reverseGeocodeHint(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VybeMap/1.0 (location-intelligence)' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

const INTEL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    safety_score: { type: 'number', description: '0-100, higher is safer for hangouts' },
    verdict: { type: 'string', enum: ['safe', 'caution', 'avoid'] },
    summary: { type: 'string' },
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning', 'danger'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['type', 'severity', 'title', 'detail'],
      },
    },
    tips: { type: 'array', items: { type: 'string' } },
    access_notes: { type: 'string' },
    typical_hours: { type: 'string' },
    parking_notes: { type: 'string' },
    accessibility_notes: { type: 'string' },
    sources_note: { type: 'string' },
  },
  required: ['safety_score', 'verdict', 'summary', 'labels', 'tips'],
};

async function researchWithGemini(
  apiKey: string,
  lat: number,
  lng: number,
  placeName: string | undefined,
  addressHint: string | null,
): Promise<Omit<MapLocationIntel, 'cache_key' | 'latitude' | 'longitude' | 'researched_at' | 'expires_at'>> {
  const locationDesc = [
    placeName ? `Place name: "${placeName}"` : null,
    addressHint ? `Address hint: ${addressHint}` : null,
    `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  ].filter(Boolean).join('\n');

  const prompt = `You are VybeMap Area Intelligence. Use Google Search to research this location for young adults planning to meet, hang out, or check in.

${locationDesc}

Research and report:
1. Is this public land vs private property? Any NO TRESPASSING / trespassing risk?
2. Safety for meeting friends (crime, lighting, isolated areas, recent incidents if findable)
3. Access rules: permits, hours, closures, construction, military/government restricted zones
4. Environmental hazards: flood zones, cliffs, water, wildfire, wildlife protection
5. Practical tips: parking, transit, accessibility, best times to visit

Label types to use when applicable: trespassing, private_property, no_trespassing, construction, closed_area, after_hours, high_crime, flood_zone, wildfire_risk, protected_wildlife, military_restricted, school_zone, permit_required, no_parking, poorly_lit, well_lit, public_park, business_district, water_hazard.

verdict rules:
- "avoid" if clear trespassing/private/restricted/military or serious danger
- "caution" if mixed signals, after-hours only, moderate crime, or incomplete info
- "safe" if public venue/park/business district with normal precautions

Be factual. If search finds nothing conclusive, say so in summary and use verdict "caution" with lower confidence — never invent incidents.
safety_score: 0-100 (100 = very safe public space).`;

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: INTEL_JSON_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[mapLocationIntel] Gemini error', res.status, errText.slice(0, 400));
    throw new HttpsError('unavailable', 'Could not research this area right now');
  }

  const raw = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
  if (!text) throw new HttpsError('internal', 'Empty intelligence response');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpsError('internal', 'Invalid intelligence response');
  }

  const score = Math.max(0, Math.min(100, Number(parsed.safety_score) || 50));
  const verdict = (['safe', 'caution', 'avoid'].includes(String(parsed.verdict))
    ? parsed.verdict
    : score >= 70 ? 'safe' : score >= 45 ? 'caution' : 'avoid') as LocationVerdict;

  const labels = Array.isArray(parsed.labels)
    ? (parsed.labels as LocationLabel[]).slice(0, 8)
    : [];

  const tips = Array.isArray(parsed.tips)
    ? (parsed.tips as string[]).filter((t) => typeof t === 'string').slice(0, 6)
    : [];

  return {
    place_name: placeName ?? null,
    safety_score: score,
    verdict,
    labels,
    summary: String(parsed.summary || 'No detailed summary available.'),
    tips,
    access_notes: parsed.access_notes ? String(parsed.access_notes) : null,
    typical_hours: parsed.typical_hours ? String(parsed.typical_hours) : null,
    parking_notes: parsed.parking_notes ? String(parsed.parking_notes) : null,
    accessibility_notes: parsed.accessibility_notes ? String(parsed.accessibility_notes) : null,
    sources_note: parsed.sources_note ? String(parsed.sources_note) : 'Based on web search — verify locally.',
  };
}

export async function getOrResearchLocationIntel(opts: {
  lat: number;
  lng: number;
  placeName?: string;
  placeId?: string;
  forceRefresh?: boolean;
}): Promise<MapLocationIntel> {
  const { lat, lng, placeName, placeId, forceRefresh } = opts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpsError('invalid-argument', 'Invalid coordinates');
  }

  const cacheKey = intelCacheKey(lat, lng);
  const cacheRef = db.collection('map_location_intel').doc(cacheKey);

  if (!forceRefresh) {
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data() as MapLocationIntel;
      if (data.expires_at && new Date(data.expires_at).getTime() > Date.now()) {
        return data;
      }
    }
  }

  const apiKey = requireGeminiKey();
  const addressHint = await reverseGeocodeHint(lat, lng);
  const researched = await researchWithGemini(apiKey, lat, lng, placeName, addressHint);

  const now = new Date();
  const intel: MapLocationIntel = {
    cache_key: cacheKey,
    latitude: lat,
    longitude: lng,
    ...researched,
    researched_at: now.toISOString(),
    expires_at: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
  };

  await cacheRef.set(intel, { merge: true });

  if (placeId) {
    await db.collection('map_places').doc(placeId).set({
      intel_summary: {
        safety_score: intel.safety_score,
        verdict: intel.verdict,
        labels: intel.labels.map((l) => ({ type: l.type, severity: l.severity, title: l.title })),
        researched_at: intel.researched_at,
      },
      updated_at: now.toISOString(),
    }, { merge: true });
  }

  return intel;
}

export function hasDangerousAccess(intel: MapLocationIntel): boolean {
  if (intel.verdict === 'avoid') return true;
  const dangerTypes = new Set([
    'trespassing', 'private_property', 'no_trespassing', 'military_restricted', 'closed_area',
  ]);
  return intel.labels.some((l) => l.severity === 'danger' && dangerTypes.has(String(l.type)));
}
