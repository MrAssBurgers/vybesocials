import { describe, expect, it } from 'vitest';
import { dmThreadActorId } from './dmThreadActor';

describe('DM thread actor', () => {
  it('starts the thread with the auth uid before the profile document is ready', () => {
    expect(dmThreadActorId({ accountReady: true, authUid: 'qa2' })).toBe('qa2');
    expect(dmThreadActorId({
      accountReady: true,
      authUid: 'qa2',
      profileUserId: 'qa2',
      profileDocumentId: 'qa2-profile',
    })).toBe('qa2-profile');
    expect(dmThreadActorId({
      accountReady: true,
      authUid: 'qa2',
      profileId: 'qa2-profile',
    })).toBe('qa2-profile');
    expect(dmThreadActorId({ accountReady: false, authUid: 'qa2' })).toBeUndefined();
  });
});
