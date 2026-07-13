import { describe, expect, it } from 'vitest';
import {
  eventDocId,
  mapDmSendToRelationshipEvent,
  relationshipScoreDocId,
  sortedPairId,
} from './relationshipEnginePure';

describe('relationshipEnginePure', () => {
  it('builds stable pair and score ids', () => {
    expect(sortedPairId('b', 'a')).toBe('a_b');
    expect(relationshipScoreDocId('viewer', 'friend')).toBe('viewer_friend');
  });

  it('dedupes events by type source and actor', () => {
    const id = eventDocId('snap_sent', 'msg-1', 'user-a');
    expect(id).toBe('snap_sent:msg-1:user-a');
    expect(eventDocId('snap_sent', 'msg-1', 'user-a')).toBe(id);
  });

  it('maps snap sends and text separately', () => {
    expect(mapDmSendToRelationshipEvent('snap', null, false)).toBe('snap_sent');
    expect(mapDmSendToRelationshipEvent('vybe', null, true)).toBe('snap_reply');
    expect(mapDmSendToRelationshipEvent('text', null, false)).toBe('message_sent');
    expect(mapDmSendToRelationshipEvent('voice', null, false)).toBe('voice_message');
    expect(mapDmSendToRelationshipEvent('unknown', null, false)).toBeNull();
  });
});
