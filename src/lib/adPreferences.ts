import type { DNAContentPreferences } from '@/hooks/useDNAPreferences';

const ENGAGEMENT_KEY = 'vybe_ad_engagement';

interface AdEngagement {
  impressions: number;
  skips: number;
  lastAt: number;
}

function loadEngagement(): AdEngagement {
  try {
    const raw = localStorage.getItem(ENGAGEMENT_KEY);
    if (raw) return JSON.parse(raw) as AdEngagement;
  } catch { /* ignore */ }
  return { impressions: 0, skips: 0, lastAt: 0 };
}

function saveEngagement(s: AdEngagement) {
  try {
    localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

/** DNA + past skips lengthen or shorten feed ad spacing. */
export function getAdFeedInterval(baseInterval: number, dna: DNAContentPreferences | null): number {
  let interval = baseInterval;
  if (dna?.discovery_level === 'conservative') interval += 2;
  if (dna?.discovery_level === 'adventurous') interval = Math.max(4, interval - 1);

  const engagement = loadEngagement();
  if (engagement.impressions >= 5 && engagement.skips / engagement.impressions > 0.6) {
    interval += 2;
  }
  return interval;
}

export function recordAdImpression() {
  const s = loadEngagement();
  s.impressions += 1;
  s.lastAt = Date.now();
  saveEngagement(s);
}

export function recordAdSkip() {
  const s = loadEngagement();
  s.skips += 1;
  s.lastAt = Date.now();
  saveEngagement(s);
}
