import { describe, expect, it, vi } from 'vitest';
import {
  FAILED_SNAP_DRAFT_TTL_MS,
  isFailedDraftExpired,
  isRevocableLocalUri,
  revokeLocalUri,
} from './snapBlobCleanup';

describe('snapBlobCleanup', () => {
  it('detects revocable blob URLs', () => {
    expect(isRevocableLocalUri('blob:http://localhost/x')).toBe(true);
    expect(isRevocableLocalUri('https://cdn.example/x.jpg')).toBe(false);
  });

  it('revokes blob URLs safely', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeLocalUri('blob:http://localhost/x');
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/x');
    revoke.mockRestore();
  });

  it('expires failed drafts after the TTL window', () => {
    const createdAt = Date.now() - FAILED_SNAP_DRAFT_TTL_MS - 1;
    expect(isFailedDraftExpired({ createdAt })).toBe(true);
    expect(isFailedDraftExpired({ createdAt: Date.now() })).toBe(false);
  });
});
