import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';

interface KeyboardAwareTexterProps {
  children: ReactNode;
  /** Fires when keyboard height changes (px). */
  onKeyboardChange?: (keyboardHeight: number) => void;
  /** Fires when Texter stack height changes (px). */
  onStackHeightChange?: (height: number) => void;
  /** Scroll message list to bottom when keyboard opens. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

function readKeyboardHeight(): number {
  const fromRoot = getComputedStyle(document.documentElement).getPropertyValue('--kb-h').trim();
  const px = parseFloat(fromRoot) || 0;
  return px;
}

/**
 * Keeps Texter above the on-screen keyboard (iOS/Android/PWA).
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
    const kb = readKeyboardHeight();
    const root = document.documentElement;
    root.style.setProperty('--keyboard-height', `${kb}px`);

    const stackH = rootRef.current?.offsetHeight ?? 0;
    root.style.setProperty('--texter-stack-h', `${stackH}px`);

    onKeyboardChange?.(kb);
    onStackHeightChange?.(stackH);

    const open = kb > 0 || document.body.dataset.kbOpen === 'true';
    if (open && !wasOpenRef.current && scrollContainerRef?.current) {
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    wasOpenRef.current = open;
  }, [onKeyboardChange, onStackHeightChange, scrollContainerRef]);

  useEffect(() => {
    publishHeights();

    const vv = window.visualViewport;
    const onViewport = () => publishHeights();
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);

    const obs = new MutationObserver(publishHeights);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-kb-open'] });

    const ro = new ResizeObserver(publishHeights);
    if (rootRef.current) ro.observe(rootRef.current);

    return () => {
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      obs.disconnect();
      ro.disconnect();
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    };
  }, [publishHeights]);

  return (
    <div
      ref={rootRef}
      className="texter-keyboard-aware"
      data-texter-dock
    >
      {children}
    </div>
  );
}
