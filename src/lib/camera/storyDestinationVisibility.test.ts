import { describe, expect, it } from 'vitest';
import {
  ALL_STORY_DESTINATION_OPTIONS,
  visibleStoryDestinationOptions,
} from './storyDestinationVisibility';

describe('visibleStoryDestinationOptions', () => {
  it('hides unsupported destinations by default', () => {
    const visible = visibleStoryDestinationOptions(false);
    expect(visible.map((o) => o.id)).toEqual(['my_story', 'close_friends']);
  });

  it('shows future destinations when the internal flag is on', () => {
    const visible = visibleStoryDestinationOptions(true);
    expect(visible).toHaveLength(ALL_STORY_DESTINATION_OPTIONS.length);
    expect(visible.some((o) => o.id === 'custom:default')).toBe(true);
  });
});
