import { describe, expect, it } from 'vitest';
import { isRecoverableDmCacheError } from '@/lib/recoverDmQueryCache';

describe('isRecoverableDmCacheError', () => {
  it('matches persisted cache Map/Set corruption', () => {
    expect(isRecoverableDmCacheError(new Error('statusMap.get is not a function'))).toBe(true);
    expect(isRecoverableDmCacheError(new Error('x.has is not a function'))).toBe(true);
    expect(isRecoverableDmCacheError(new Error('rows.filter is not a function'))).toBe(true);
    expect(isRecoverableDmCacheError(new Error('data is not iterable'))).toBe(true);
  });

  it('matches known DM TDZ regressions', () => {
    expect(isRecoverableDmCacheError(new Error('messagesContainerRef is not defined'))).toBe(true);
    expect(isRecoverableDmCacheError(new Error('showPeerPresence is not defined'))).toBe(true);
    expect(isRecoverableDmCacheError(new Error('registeredConvoRef is not defined'))).toBe(true);
  });

  it('rejects unrelated errors', () => {
    expect(isRecoverableDmCacheError(new Error('Network request failed'))).toBe(false);
    expect(isRecoverableDmCacheError(new Error('permission-denied'))).toBe(false);
  });
});
