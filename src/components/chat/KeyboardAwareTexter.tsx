import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';

interface KeyboardAwareTexterProps {
  children: ReactNode;
  onKeyboardChange?: (keyboardHeight: number) => void;
  onStackHeightChange?: (height: number) => void;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

function measureKeyboardHeight(): number {
  const vv = window.visualViewport;
  if (vv) {
    return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  }
  const fromRoot = getComputedStyle(document.documentElement).getPropertyValue('--kb-h').trim();
  return parseFloat(fromRoot) || 0;
}

function scrollMessagesToBottom(container: HTMLElement | null | undefined) {
  if (!container) return;
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

/**
 * Keeps Texter pinned above the on-screen keyboard (iOS/Android/PWA/Despia).
 * Sets `--keyboard-height` and `--texter-stack-h` for message-list padding.
 */
export function KeyboardAwareTexter({
  children,
  onKeyboardChange,
  onStackHeightChange,
  scrollContainerRef,
}: KeyboardAwareTexterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  const publishHeights = useCallback(() => {
    const kb = measureKeyboardHeight();
    const root = document.documentElement;
    root.style.setProperty('--keyboard-height', `${kb}px`);
    root.style.setProperty('--kb-h', `${kb}px`);

    const stackH = rootRef.current?.offsetHeight ?? 0;
    root.style.setProperty('--texter-stack-h', `${stackH}px`);

    onKeyboardChange?.(kb);
    onStackHeightChange?.(stackH);

    const open = kb > 0 || document.body.dataset.kbOpen === 'true';
    if (open) {
      document.body.dataset.kbOpen = 'true';
      if (!wasOpenRef.current) {
        scrollMessagesToBottom(scrollContainerRef?.current);
      }
    } else {
      delete document.body.dataset.kbOpen;
    }
    wasOpenRef.current = open;
  }, [onKeyboardChange, onStackHeightChange, scrollContainerRef]);

  useEffect(() => {
    publishHeights();

    const vv = window.visualViewport;
    const onViewport = () => publishHeights();
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);

    const obs = new MutationObserver(publishHeights);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-kb-open'] });

    const ro = new ResizeObserver(publishHeights);
    if (rootRef.current) ro.observe(rootRef.current);

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLInputElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        scrollMessagesToBottom(scrollContainerRef?.current);
        requestAnimationFrame(publishHeights);
      }
    };
    document.addEventListener('focusin', onFocusIn);

    return () => {
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
      document.removeEventListener('focusin', onFocusIn);
      obs.disconnect();
      ro.disconnect();
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      delete document.body.dataset.kbOpen;
    };
  }, [publishHeights, scrollContainerRef]);

  return (
    <div ref={rootRef} className="texter-keyboard-aware" data-texter-dock>
      {children}
    </div>
  );
}
