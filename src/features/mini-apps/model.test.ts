import { describe, expect, it } from 'vitest';
import { MINI_APP_CODE_LIMIT, miniAppError, validateMiniApp } from './model';
import { MINI_APP_TEMPLATES } from './templates';

describe('mini app persistence boundary', () => {
  const source = MINI_APP_TEMPLATES[0].source;
  it('validates every shipped template', () => {
    for (const template of MINI_APP_TEMPLATES) expect(validateMiniApp(template.source)).toEqual(template.source);
  });
  it('drops injected ownership and publication metadata', () => {
    expect(validateMiniApp({ ...source, title: '  My app  ', owner_id: 'victim', status: 'published', created_at: 'fake' })).toEqual({ ...source, title: 'My app' });
  });
  it.each([
    { title: ' ' }, { title: 'x'.repeat(61) }, { description: 'x'.repeat(241) },
    { category: 'admin' }, { html: {}, javascript: 1 }, { html: '', javascript: '' },
    { javascript: 'x'.repeat(MINI_APP_CODE_LIMIT) },
  ])('rejects invalid persisted input %j', changes => {
    expect(() => validateMiniApp({ ...source, ...changes })).toThrow();
  });
  it('allows the exact combined character limit', () => {
    expect(validateMiniApp({ ...source, html: 'x'.repeat(MINI_APP_CODE_LIMIT), css: '', javascript: '' }).html.length).toBe(MINI_APP_CODE_LIMIT);
  });
  it('distinguishes blocked publication from an account-wide unavailable draft library', () => {
    const denied = { code: 'permission-denied' };
    expect(miniAppError(denied, 'publish')).toContain('Publishing is blocked for this app');
    expect(miniAppError(denied, 'publish')).toContain('keep saving and previewing your private draft');
    expect(miniAppError(denied)).toContain('not available for your account');
    expect(miniAppError(new Error('Connection lost'), 'publish')).toBe('Connection lost');
    expect(miniAppError({ code: 'internal', message: 'INTERNAL' }, 'publish')).toContain('not available right now');
    expect(miniAppError({ code: 'not-found', message: 'NOT_FOUND' }, 'publish')).toContain('private draft is still saved');
  });
});
