import { describe, expect, it, vi, beforeEach } from 'vitest';
import { looksLikeEmail, normalizeLoginEmail, resolveLoginEmail } from '@/lib/loginEmail';

vi.mock('@/lib/firebase/functionsService', () => ({
  invokeFunction: vi.fn(),
}));

import { invokeFunction } from '@/lib/firebase/functionsService';

describe('loginEmail', () => {
  beforeEach(() => {
    vi.mocked(invokeFunction).mockReset();
  });

  it('normalizes email casing and whitespace', () => {
    expect(normalizeLoginEmail('  Ada@VYBE.APP ')).toBe('ada@vybe.app');
  });

  it('detects email vs username', () => {
    expect(looksLikeEmail('ada@vybe.app')).toBe(true);
    expect(looksLikeEmail('ada_vybe')).toBe(false);
    expect(looksLikeEmail('@ada_vybe')).toBe(false);
  });

  it('passes email through without calling the backend', async () => {
    await expect(resolveLoginEmail('Ada@Vybe.app')).resolves.toBe('ada@vybe.app');
    expect(invokeFunction).not.toHaveBeenCalled();
  });

  it('resolves username via auth-qr resolve_login', async () => {
    vi.mocked(invokeFunction).mockResolvedValue({
      data: { email: 'ada@vybe.app', kind: 'username' },
      error: null,
    });
    await expect(resolveLoginEmail('@Ada_Vybe')).resolves.toBe('ada@vybe.app');
    expect(invokeFunction).toHaveBeenCalledWith(
      'auth-qr',
      expect.objectContaining({ action: 'resolve_login', identifier: 'Ada_Vybe' }),
    );
  });

  it('maps missing username to a clear not-found error', async () => {
    vi.mocked(invokeFunction).mockResolvedValue({
      data: null,
      error: { message: 'Account not found', name: 'not-found' },
    });
    await expect(resolveLoginEmail('ghost_user')).rejects.toMatchObject({
      message: expect.stringMatching(/No account found with that username/i),
      name: 'login/username-not-found',
    });
  });

  it('maps lookup failures without pretending the username was an email', async () => {
    vi.mocked(invokeFunction).mockResolvedValue({
      data: null,
      error: { message: 'internal', name: 'internal' },
    });
    await expect(resolveLoginEmail('ada_vybe')).rejects.toMatchObject({
      name: 'login/username-lookup-failed',
    });
  });
});
