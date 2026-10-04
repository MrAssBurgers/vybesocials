import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
describe('shared theme validation parity', () => {
  it('keeps browser and server token validation identical', () => {
    const browser = readFileSync('src/lib/sharedThemeSchema.ts', 'utf8').split('\n').slice(1).join('\n').replaceAll('\r\n', '\n');
    const server = readFileSync('functions/src/_shared/sharedThemeSchema.ts', 'utf8').replaceAll('\r\n', '\n');
    expect(browser).toBe(server);
  });
});
