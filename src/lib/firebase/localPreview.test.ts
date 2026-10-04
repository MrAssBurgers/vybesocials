import { describe, expect, it } from 'vitest';
import { assertLocalPreviewStorage, validateLocalPreview } from './localPreview';

const valid = { enabled: 'true', development: true, projectId: 'demo-vybe-preview', hostname: '127.0.0.1', port: '8082' };
describe('isolated local preview boundary', () => {
  it.each([undefined, '', 'false'])('does not alter normal Firebase configuration for %s', enabled => {
    expect(validateLocalPreview({ ...valid, enabled, development: false, projectId: 'production' })).toBe(false);
  });
  it.each(['127.0.0.1', 'localhost', '[::1]'])('accepts explicit demo development on %s', hostname => {
    expect(validateLocalPreview({ ...valid, hostname })).toBe(true);
  });
  it.each([{ development: false }, { projectId: 'vybe-daaab' }, { projectId: 'demo-other' }, { hostname: 'vybehub.app' }, { hostname: 'localhost.example.com' }, { port: '8081' }, { enabled: 'yes' }])('fails closed instead of silently selecting production: %j', extra => {
    expect(() => validateLocalPreview({ ...valid, ...extra })).toThrow('Local QA requires');
  });
  it.each([
    { 'firebase:authUser:real-api-key:[DEFAULT]': 'retained' },
    { 'sb-real-auth-token': 'retained' },
    { 'vybe.auth.user': JSON.stringify({ apiKey: 'real-api-key', uid: 'real-user' }) },
    { 'vybe.auth.user': 'malformed-backup' },
  ])('refuses real or unresolved sessions without changing stored data: %j', values => {
    const entries = new Map(Object.entries(values));
    const storage = { length: entries.size, key: (index: number) => [...entries.keys()][index], getItem: (key: string) => entries.get(key) ?? null };
    expect(() => assertLocalPreviewStorage(storage)).toThrow('Local QA');
    expect(Object.fromEntries(entries)).toEqual(values);
  });
  it('allows a previous synthetic preview login', () => {
    expect(() => assertLocalPreviewStorage({ length: 1, key: () => 'firebase:authUser:demo-vybe-preview-key:[DEFAULT]', getItem: () => null })).not.toThrow();
  });
});
