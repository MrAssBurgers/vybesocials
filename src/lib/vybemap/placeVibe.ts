import type { MapPlace } from './types';

export type VibeLevel = 'busy' | 'active' | 'chill' | 'quiet';

export interface PlaceVibe {
  level: VibeLevel;
  emoji: string;
  label: string;
  score: number;
  activitySummary: string;
}

/** Recorded activity score; check-in events cannot establish a current crowd. */
export function computePlaceVibe(place: MapPlace): PlaceVibe {
  const checkIns = place.check_in_count ?? 0;
  const stories = place.story_count ?? 0;
  const score = Math.min(100, checkIns * 4 + stories * 8 + (place.vibe_tags?.length ?? 0) * 2);
  const activitySummary = `${checkIns} ${checkIns === 1 ? 'check-in' : 'check-ins'} recorded`;

  if (score >= 70) {
    return { level: 'busy', emoji: '🔥', label: 'High activity', score, activitySummary };
  }
  if (score >= 35) {
    return { level: 'active', emoji: '⚡', label: 'Moderate activity', score, activitySummary };
  }
  if (score >= 12) {
    return { level: 'chill', emoji: '😊', label: 'Light activity', score, activitySummary };
  }
  return { level: 'quiet', emoji: '😴', label: 'Low activity', score, activitySummary };
}
