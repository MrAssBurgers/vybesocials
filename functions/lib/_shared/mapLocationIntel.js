/**
 * VybeMap Area Intelligence — Gemini + Google Search grounding for location safety research.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './admin.js';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function requireGeminiKey() {
    const key = process.env.GEMINI_API_KEY;
    if (!key)
        throw new HttpsError('failed-precondition', 'Area intelligence unavailable');
    return key;
}
/** ~110m grid cache key. */
export function intelCacheKey(lat, lng) {
    const rLat = Math.round(lat * 1000) / 1000;
    const rLng = Math.round(lng * 1000) / 1000;
    return `${rLat}_${rLng}`;
}
async function reverseGeocodeHint(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'VybeMap/1.0 (location-intelligence)' },
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        return data.display_name ?? null;
    }
    catch {
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
function checkedResearchOutput(parsed) {
    const invalid = () => { throw new HttpsError('unavailable', 'Area research returned incomplete details. Retry shortly.'); };
    const bounded = (value, max, optional = false) => {
        if (optional && value == null)
            return null;
        if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()))
            return invalid();
        return value;
    };
    if (typeof parsed.safety_score !== 'number' || !Number.isFinite(parsed.safety_score) || parsed.safety_score < 0 || parsed.safety_score > 100
        || !['safe', 'caution', 'avoid'].includes(String(parsed.verdict)) || !Array.isArray(parsed.labels) || !Array.isArray(parsed.tips))
        invalid();
    const labels = parsed.labels.slice(0, 8).map(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return invalid();
        const row = value;
        if (!['info', 'warning', 'danger'].includes(String(row.severity)))
            return invalid();
        return { type: bounded(row.type, 80), severity: row.severity, title: bounded(row.title, 200), detail: bounded(row.detail, 4000) };
    });
    return { safety_score: parsed.safety_score, verdict: parsed.verdict, labels,
        summary: bounded(parsed.summary, 16000), tips: parsed.tips.slice(0, 6).map(value => bounded(value, 4000)),
        access_notes: bounded(parsed.access_notes, 4000, true), typical_hours: bounded(parsed.typical_hours, 4000, true),
        parking_notes: bounded(parsed.parking_notes, 4000, true), accessibility_notes: bounded(parsed.accessibility_notes, 4000, true),
        sources_note: bounded(parsed.sources_note, 4000, true) ?? 'Based on web search — verify locally.' };
}
async function researchWithGemini(apiKey, lat, lng, placeName, addressHint) {
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
    const raw = await res.json();
    const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
    if (!text)
        throw new HttpsError('internal', 'Empty intelligence response');
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new HttpsError('internal', 'Invalid intelligence response');
    }
    return { place_name: placeName ?? null, ...checkedResearchOutput(parsed) };
}
export async function getOrResearchLocationIntel(opts) {
    const { lat, lng, placeName, forceRefresh, ownerUid, profileId, beforeResearch, beforeReturn } = opts;
    if (!ownerUid || !profileId || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new HttpsError('invalid-argument', 'Invalid coordinates');
    }
    // Never adopt the old global coarse cache: it contains other callers' exact
    // coordinates and private place names. Admission is rechecked even on hits.
    const cacheKey = createHash('sha256').update(JSON.stringify(['v2', ownerUid, profileId, lat, lng, placeName ?? null, opts.placeId ?? null])).digest('hex');
    const cacheRef = db.collection('map_location_intel').doc(cacheKey);
    if (!forceRefresh) {
        const cached = await cacheRef.get();
        if (cached.exists) {
            const row = cached.data();
            const data = row?.intel;
            if (row?.version === 2 && row.owner_uid === ownerUid && row.profile_id === profileId && row.place_id === (opts.placeId ?? null)
                && data?.cache_key === cacheKey && data.latitude === lat && data.longitude === lng && data.place_name === (placeName ?? null)
                && typeof data.researched_at === 'string' && Number.isFinite(Date.parse(data.researched_at))
                && data.expires_at && new Date(data.expires_at).getTime() > Date.now()) {
                const projected = { ...checkedResearchOutput(data), cache_key: cacheKey, latitude: lat, longitude: lng,
                    place_name: placeName ?? null, researched_at: data.researched_at, expires_at: data.expires_at };
                await beforeReturn();
                return projected;
            }
        }
    }
    await beforeResearch();
    const apiKey = requireGeminiKey();
    const addressHint = await reverseGeocodeHint(lat, lng);
    const researched = await researchWithGemini(apiKey, lat, lng, placeName, addressHint);
    const now = new Date();
    const intel = {
        cache_key: cacheKey,
        latitude: lat,
        longitude: lng,
        ...researched,
        researched_at: now.toISOString(),
        expires_at: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
    };
    await beforeReturn();
    await cacheRef.set({ version: 2, owner_uid: ownerUid, profile_id: profileId, place_id: opts.placeId ?? null, intel,
        expireAt: Timestamp.fromMillis(now.getTime() + CACHE_TTL_MS) });
    // Research is separate metadata. A caller-supplied place ID must never
    // mutate, invalidate the publication proof of, or recreate a map place.
    return intel;
}
export function hasDangerousAccess(intel) {
    if (intel.verdict === 'avoid')
        return true;
    const dangerTypes = new Set([
        'trespassing', 'private_property', 'no_trespassing', 'military_restricted', 'closed_area',
    ]);
    return intel.labels.some((l) => l.severity === 'danger' && dangerTypes.has(String(l.type)));
}
//# sourceMappingURL=mapLocationIntel.js.map