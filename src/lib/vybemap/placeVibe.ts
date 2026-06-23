import type { MapPlace } from './types';

export type VibeLevel = 'busy' | 'active' | 'chill' | 'quiet';

export interface PlaceVibe {
  level: VibeLevel;
  emoji: string;
  label: string;
  score: number;
  crowdEstimate: string;
}

/** Client-side live vibe score from place activity signals. */
export function computePlaceVibe(place: MapPlace): PlaceVibe {
  const checkIns = place.check_in_count ?? 0;
  const stories = place.story_count ?? 0;
  const score = Math.min(100, checkIns * 4 + stories * 8 + (place.vibe_tags?.length ?? 0) * 2);

  if (score >= 70) {
    return { level: 'busy', emoji: '🔥', label: 'Busy', score, crowdEstimate: crowdLabel(checkIns, 'high') };
  }
  if (score >= 35) {
    return { level: 'active', emoji: '⚡', label: 'Active', score, crowdEstimate: crowdLabel(checkIns, 'mid') };
  }
  if (score >= 12) {
    return { level: 'chill', emoji: '😊', label: 'Chill', score, crowdEstimate: crowdLabel(checkIns, 'low') };
  }
  return { level: 'quiet', emoji: '😴', label: 'Quiet', score, crowdEstimate: crowdLabel(checkIns, 'low') };
}

function crowdLabel(checkIns: number, band: 'low' | 'mid' | 'high'): string {
  const est = Math.max(checkIns, band === 'high' ? 25 : band === 'mid' ? 8 : 2);
  if (est >= 100) return '900+ people vibe here';
  if (est >= 50) return `${est * 3}+ people nearby`;
  return `${est} ${est === 1 ? 'person' : 'people'} checked in`;
}
