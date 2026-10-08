export interface ComposerKey {
  key?: string;
  code?: string;
  keyCode?: number;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}

/** Enter sends. Shift+Enter, shortcuts, and IME composition keep the newline. */
export function composerKeyShouldSend(event: ComposerKey): boolean {
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
  return event.key === 'Enter' || event.code === 'Enter' || event.keyCode === 13;
}

/**
 * Some phone keyboards insert a line break without a keydown.
 * Shift+Enter already requested a newline, so that break must not send.
 */
export function composerBeforeInputShouldSend(
  inputType: string | undefined,
  shiftNewline: boolean,
  isComposing = false,
): boolean {
  if (shiftNewline || isComposing) return false;
  return inputType === 'insertLineBreak' || inputType === 'insertParagraph';
}
