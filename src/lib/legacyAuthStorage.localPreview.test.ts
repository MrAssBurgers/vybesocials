import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ preview: true }));
vi.mock('./firebase/localPreview', async importOriginal => ({ ...await importOriginal<typeof import('./firebase/localPreview')>(), isLocalPreview: () => state.preview }));
vi.mock('./firebase/config', () => ({ isFirebaseConfigured: () => true, getFirebaseConfig: () => ({ projectId: 'normal-project' }) }));
import { clearObsoleteAuthStorage, getStoredAuthUserId, hasStoredAuthSession, migrateLegacyAuthStorage, repairLegacyAuthStorage } from './legacyAuthStorage';
const demoKey = 'firebase:authUser:demo-vybe-preview-key:[DEFAULT]';
beforeEach(() => {
  state.preview = true;
  // Browser Storage enumerates saved keys, unlike the suite's Map-backed stub.
  const values: Record<string, unknown> = Object.create(null);
  Object.defineProperties(values, {
    length: { get: () => Object.keys(values).length },
    key: { value: (index: number) => Object.keys(values)[index] ?? null },
    getItem: { value: (key: string) => values[key] ?? null },
    setItem: { value: (key: string, value: string) => { values[key] = String(value); } },
    removeItem: { value: (key: string) => { delete values[key]; } },
    clear: { value: () => { for (const key of Object.keys(values)) delete values[key]; } },
  });
  vi.stubGlobal('localStorage', values);
  sessionStorage.clear();
});

describe('demo login hints and legacy migration isolation', () => {
  it('never migrates or deletes normal backups through any public migration entry point', () => {
    const backup = JSON.stringify({ user: { id: 'retained-normal-user' } });
    localStorage.setItem('sb-hprmicwhlaaqfgshucec-auth-token', backup);
    localStorage.setItem('sb-eabvbtkxdbttjpdpbmuw-auth-token', backup);
    localStorage.setItem('firebase:authUser:normal-key:[DEFAULT]', JSON.stringify({ uid: 'retained-normal-user' }));
    localStorage.setItem('vybe.auth.user', backup);
    const before = { ...localStorage };
    expect(migrateLegacyAuthStorage()).toBe(false);
    repairLegacyAuthStorage(); clearObsoleteAuthStorage();
    expect({ ...localStorage }).toEqual(before);
    expect(hasStoredAuthSession()).toBe(false);
    expect(getStoredAuthUserId()).toBeNull();
  });
  it('uses only the current tab demo identity for login hints', () => {
    sessionStorage.setItem(demoKey, JSON.stringify({ apiKey: 'demo-vybe-preview-key', uid: 'preview-alice' }));
    expect(hasStoredAuthSession()).toBe(true);
    expect(getStoredAuthUserId()).toBe('preview-alice');
    sessionStorage.removeItem(demoKey);
    expect(getStoredAuthUserId()).toBeNull();
  });
  it.each(['invalid-json', JSON.stringify({ uid: 'wrong-project-user', apiKey: 'normal-key' }), '{}'])('ignores unresolved demo storage: %s', value => {
    sessionStorage.setItem(demoKey, value);
    expect(hasStoredAuthSession()).toBe(false);
    expect(getStoredAuthUserId()).toBeNull();
  });
  it('preserves ordinary Firebase login hints and legacy cleanup', () => {
    state.preview = false;
    localStorage.setItem('firebase:authUser:normal-key:[DEFAULT]', JSON.stringify({ uid: 'normal-user' }));
    localStorage.setItem('sb-eabvbtkxdbttjpdpbmuw-auth-token', 'obsolete');
    expect(hasStoredAuthSession()).toBe(true);
    expect(getStoredAuthUserId()).toBe('normal-user');
    clearObsoleteAuthStorage();
    expect(localStorage.getItem('sb-eabvbtkxdbttjpdpbmuw-auth-token')).toBeNull();
    expect(getStoredAuthUserId()).toBe('normal-user');
  });
});
