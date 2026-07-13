import { isFeatureEnabled } from '@/lib/featureFlags';
import type { StoryDestinationId } from '@/lib/camera/recipientSelection';

export interface StoryDestinationOption {
  id: StoryDestinationId;
  supported: boolean;
}

export const ALL_STORY_DESTINATION_OPTIONS: StoryDestinationOption[] = [
  { id: 'my_story', supported: true },
  { id: 'close_friends', supported: true },
  { id: 'custom:default', supported: false },
  { id: 'group:default', supported: false },
];

/**
 * Story destinations shown in Send To / editor audience pickers.
 * Unsupported destinations stay hidden unless the internal flag is on.
 */
export function visibleStoryDestinationOptions(
  showFutureDestinations = isFeatureEnabled('snap_future_story_destinations'),
): StoryDestinationOption[] {
  return ALL_STORY_DESTINATION_OPTIONS.filter((opt) => opt.supported || showFutureDestinations);
}
