import { useLayoutEffect, useState } from 'react';

/** Optional prompts yield to open dialogs and wait for their exit DOM to leave. */
export function useOptionalPromptBlocked(prompt: 'crash-consent' | 'push', enabled: boolean) {
  const read = () => enabled && typeof document !== 'undefined' && Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
    .some(element => element.getAttribute('data-vybe-optional-prompt') !== prompt);
  const [blocked, setBlocked] = useState(read);
  useLayoutEffect(() => {
    if (!enabled) { setBlocked(false); return; }
    const update = () => setBlocked(Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
      .some(element => element.getAttribute('data-vybe-optional-prompt') !== prompt));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['role', 'data-vybe-optional-prompt'] });
    update();
    return () => observer.disconnect();
  }, [prompt, enabled]);
  return blocked;
}
