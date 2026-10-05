import { describe, expect, it } from 'vitest';
import { computePlaceVibe } from './placeVibe';
import type { MapPlace } from './types';

const place = (count: number, stories = 0): MapPlace => ({
  id: 'spot', name: 'Park', category: 'hangout', latitude: 40, longitude: -80,
  check_in_count: count, story_count: stories, vibe_tags: ['hangout'],
});

describe('recorded spot activity', () => {
  it.each([
    [0, '0 check-ins recorded'],
    [1, '1 check-in recorded'],
    [50, '50 check-ins recorded'],
    [100, '100 check-ins recorded'],
    [1000, '1000 check-ins recorded'],
  ])('preserves the exact check-in event count %i without crowd inflation', (count, expected) => {
    const result = computePlaceVibe(place(count));
    expect(result.activitySummary).toBe(expected);
    expect(result.activitySummary).not.toMatch(/people|person|nearby|\+/);
    expect(result.label).toMatch(/activity/);
  });

  it('does not invent check-ins from stories, category tags, or the activity score', () => {
    expect(computePlaceVibe(place(0, 100)).activitySummary).toBe('0 check-ins recorded');
    expect(computePlaceVibe(place(1, 100)).activitySummary).toBe('1 check-in recorded');
  });
});
