import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dm-chat-shell CSS contract', () => {
  it('does not use position:fixed for the chat shell', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    // Base rule block (first occurrence of ".dm-chat-shell {" with position).
    const baseMatch = css.match(/\/\* Active chat view[\s\S]*?\.dm-chat-shell \{([\s\S]*?)\}/);
    expect(baseMatch?.[1] ?? '').toMatch(/position:\s*relative/);
    expect(baseMatch?.[1] ?? '').not.toMatch(/position:\s*fixed/);

    const mobileMatch = css.match(
      /html\[data-dm-active='true'\] \.dm-chat-shell \{([\s\S]*?)\}/,
    );
    expect(mobileMatch?.[1] ?? '').toMatch(/position:\s*absolute/);
    expect(mobileMatch?.[1] ?? '').not.toMatch(/position:\s*fixed/);
  });
});
