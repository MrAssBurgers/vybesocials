import { describe, expect, it } from 'vitest';
import { composerBeforeInputShouldSend, composerKeyShouldSend } from './composerEnter';

describe('DM composer Enter', () => {
  it('sends on Enter and keeps Shift+Enter as a newline', () => {
    expect(composerKeyShouldSend({ key: 'Enter' })).toBe(true);
    expect(composerKeyShouldSend({ code: 'Enter', key: 'Unidentified' })).toBe(true);
    expect(composerKeyShouldSend({ keyCode: 13 })).toBe(true);
    expect(composerKeyShouldSend({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(composerKeyShouldSend({ key: 'Enter', ctrlKey: true })).toBe(false);
    expect(composerKeyShouldSend({ key: 'Enter', isComposing: true })).toBe(false);
    expect(composerKeyShouldSend({ key: 'a' })).toBe(false);
  });

  it('sends a phone line-break that skipped keydown, except after Shift+Enter', () => {
    expect(composerBeforeInputShouldSend('insertLineBreak', false)).toBe(true);
    expect(composerBeforeInputShouldSend('insertParagraph', false)).toBe(true);
    expect(composerBeforeInputShouldSend('insertLineBreak', true)).toBe(false);
    expect(composerBeforeInputShouldSend('insertText', false)).toBe(false);
    expect(composerBeforeInputShouldSend('insertLineBreak', false, true)).toBe(false);
  });
});
