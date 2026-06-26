import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { isDespiaRuntime } from '@/lib/despiaBridge';

interface KeyboardAwareTexterProps {
  children: ReactNode;
  onKeyboardChange?: (keyboardHeight: number) => void;
  onStackHeightChange?: (height: number) => void;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

function readCachedKeyboardHeight(): number {
  const fromRoot = getComputedStyle(document.documentElement).getPropertyValue('--kb-h').trim();
  return parseFloat(fromRoot) || 0;
}

function estimateKeyboardHeight(baselineInnerHeight: number): number {
  const vv = window.visualViewport;
  if (vv) {
    const fromVv = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (fromVv > 48) return fromVv;
  }

  const shrink = Math.max(0, baselineInnerHeight - window.innerHeight);
  if (shrink > 48) return shrink;

  const layoutGap = Math.max(0, window.innerHeight - document.documentElement.clientHeight);
  if (layoutGap > 48) return layoutGap;

  const cached = readCachedKeyboardHeight();
  if (cached > 48) return cached;

  // iOS / Despia WebViews often omit visualViewport deltas until late — use a sane default.
  return Math.round(window.innerHeight * (isDespiaRuntime() ? 0.42 : 0.36));
}

function measureKeyboardHeight(baselineInnerHeight: number, assumeOpen: boolean): number {
  if (!assumeOpen) return 0;
  return estimateKeyboardHeight(baselineInnerHeight);
}

function scrollMessagesToBottom(container: HTMLElement | null | undefined) {
  if (!container) return;
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function isTextInput(el: EventTarget | null): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
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
  const baselineHeightRef = useRef(typeof window !== 'undefined' ? window.innerHeight : 0);
  const pollRef = useRef(0);

  const publishHeights = useCallback(() => {
    const focused = document.activeElement;
    const typing = isTextInput(focused) || (focused instanceof HTMLElement && focused.isContentEditable);
    const kb = measureKeyboardHeight(baselineHeightRef.current, typing || document.body.dataset.kbOpen === 'true');
    const root = document.documentElement;
    root.style.setProperty('--keyboard-height', `${kb}px`);
    root.style.setProperty('--kb-h', `${kb}px`);

    const stackH = rootRef.current?.offsetHeight ?? 0;
    root.style.setProperty('--texter-stack-h', `${stackH}px`);

    onKeyboardChange?.(kb);
    onStackHeightChange?.(stackH);

    const open = kb > 0 || typing;
    if (open) {
      document.body.dataset.kbOpen = 'true';
      if (!wasOpenRef.current) {
        scrollMessagesToBottom(scrollContainerRef?.current);
      }
    } else if (!typing) {
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

    const startKeyboardPoll = () => {
      cancelAnimationFrame(pollRef.current);
      let frames = 0;
      const tick = () => {
        frames += 1;
        publishHeights();
        if (frames < 36) pollRef.current = requestAnimationFrame(tick);
      };
      pollRef.current = requestAnimationFrame(tick);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextInput(e.target) && !(e.target instanceof HTMLElement && e.target.isContentEditable)) {
        return;
      }
      baselineHeightRef.current = window.innerHeight;
      document.body.dataset.kbOpen = 'true';
      scrollMessagesToBottom(scrollContainerRef?.current);
      startKeyboardPoll();
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        const focused = document.activeElement;
        const stillTyping =
          isTextInput(focused) || (focused instanceof HTMLElement && focused.isContentEditable);
        if (!stillTyping) {
          delete document.body.dataset.kbOpen;
          document.documentElement.style.setProperty('--keyboard-height', '0px');
          document.documentElement.style.setProperty('--kb-h', '0px');
          wasOpenRef.current = false;
        }
        publishHeights();
      }, 80);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      cancelAnimationFrame(pollRef.current);
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      obs.disconnect();
      ro.disconnect();
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.documentElement.style.setProperty('--kb-h', '0px');
      delete document.body.dataset.kbOpen;
    };
  }, [publishHeights, scrollContainerRef]);

  return (
    <div ref={rootRef} className="texter-keyboard-aware" data-texter-dock>
      {children}
    </div>
  );
}
