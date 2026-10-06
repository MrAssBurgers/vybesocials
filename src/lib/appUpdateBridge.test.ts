import { afterEach, expect, it } from 'vitest';
import { hasActiveAppDraft } from './appUpdateBridge';
afterEach(() => { document.body.innerHTML = ''; delete (window as unknown as { __VYBE_HAS_BOOT_DRAFT__?: () => boolean }).__VYBE_HAS_BOOT_DRAFT__; });
it('recognizes edits recorded before deferred worker setup', () => {
  (window as unknown as { __VYBE_HAS_BOOT_DRAFT__: () => boolean }).__VYBE_HAS_BOOT_DRAFT__ = () => true;
  expect(hasActiveAppDraft()).toBe(true);
});
it('recognizes prefilled text and rich text without boot support', () => {
  document.body.innerHTML = '<textarea>Keep this</textarea>'; expect(hasActiveAppDraft()).toBe(true);
  document.body.innerHTML = '<div contenteditable="true">Keep this too</div>'; expect(hasActiveAppDraft()).toBe(true);
});
it('allows an idle form but defers while a field has focus', () => {
  document.body.innerHTML = '<input type="text"><input type="hidden" value="metadata"><input type="checkbox" value="on">';
  expect(hasActiveAppDraft()).toBe(false);
  document.querySelector('input')!.focus(); expect(hasActiveAppDraft()).toBe(true);
});
