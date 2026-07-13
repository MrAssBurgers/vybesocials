import type { DMConversationPreview } from '@/features/dms/dm.types';
import { RELATIONSHIP_STATE_LABELS } from '@/lib/relationship/relationshipEmojiMap';
import type { PrimaryRelationshipState } from '@/lib/relationship/relationshipTypes';

export function relationshipLabelForPreview(preview?: DMConversationPreview): string {
  if (!preview) return 'Friends';

  const state = preview.relationship?.primary_relationship_state;
  const emoji = preview.relationshipEmoji;
  if (state && state !== 'friend') {
    const title = RELATIONSHIP_STATE_LABELS[state as PrimaryRelationshipState] || state;
    return emoji ? `${title} ${emoji}` : title;
  }

  if (preview.relationshipBadge === 'close_friend') return 'Best Friends';
  if (preview.relationshipBadge === 'new_friend') return 'New Friends';
  return 'Friends';
}
