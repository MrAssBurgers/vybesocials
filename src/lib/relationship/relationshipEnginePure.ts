/** Client-testable mirrors of server relationship engine pure helpers. */

export type RelationshipEventType =
  | 'snap_sent'
  | 'snap_received'
  | 'snap_reply'
  | 'message_sent'
  | 'message_received'
  | 'voice_message'
  | 'call_minute'
  | 'video_call_minute'
  | 'shared_post_reply'
  | 'reaction'
  | 'friend_added';

export function sortedPairId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function relationshipScoreDocId(viewerId: string, friendId: string): string {
  return `${viewerId}_${friendId}`;
}

export function eventDocId(eventType: string, sourceId: string, actorId: string): string {
  return `${eventType}:${sourceId}:${actorId}`;
}

function isQualifyingSnap(messageType: string, mediaType: string | null): boolean {
  const t = messageType.toLowerCase();
  if (t === 'vybe' || t === 'snap') return true;
  if (t === 'image' || t === 'video' || t === 'media') {
    return mediaType !== 'text';
  }
  return false;
}

export function mapDmSendToRelationshipEvent(
  messageType: string,
  mediaType: string | null,
  hasReply: boolean,
): RelationshipEventType | null {
  if (isQualifyingSnap(messageType, mediaType)) {
    return hasReply ? 'snap_reply' : 'snap_sent';
  }
  const t = messageType.toLowerCase();
  if (t === 'voice' || t === 'audio') return 'voice_message';
  if (t === 'text' || t === 'media') return 'message_sent';
  if (t === 'shared_post' || t === 'shared_clip') return 'shared_post_reply';
  return null;
}
