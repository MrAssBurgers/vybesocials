import { describe, expect, it } from 'vitest';
import {
  postBelongsToCaller,
  resolvePostOwnerId,
} from '../../functions/src/_shared/postOwnership';

describe('post ownership checks', () => {
  it('uses author_id as the canonical post owner field', () => {
    expect(
      postBelongsToCaller(
        { author_id: 'profile-owner' },
        'caller-auth-uid',
        'profile-owner',
      ),
    ).toBe(true);
  });

  it('rejects a caller whose auth and profile ids do not match author_id', () => {
    expect(
      postBelongsToCaller(
        { author_id: 'other-profile' },
        'caller-auth-uid',
        'caller-profile',
      ),
    ).toBe(false);
  });

  it('keeps legacy user_id ownership support', () => {
    expect(
      postBelongsToCaller(
        { user_id: 'caller-auth-uid' },
        'caller-auth-uid',
        'caller-profile',
      ),
    ).toBe(true);
  });

  it('treats missing or blank owner ids as invalid', () => {
    expect(resolvePostOwnerId({ author_id: '   ' })).toBe('');
    expect(postBelongsToCaller({}, 'caller-auth-uid', 'caller-profile')).toBe(false);
  });
});
