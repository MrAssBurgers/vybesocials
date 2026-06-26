import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  KEYBOARD_INSET_THRESHOLD_PX,
  measureSoftKeyboardHeight,
  shouldTrackSoftKeyboard,
} from '@/lib/keyboardInsets';

interface KeyboardAwareTexterProps {
  children: ReactNode;
  onKeyboardChange?: (keyboardHeight: number) => void;
  onStackHeightChange?: (height: number) => void;
  scrollContainerRef?: RefObject<HTMLElement | null>;
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
 * Keyboard-aware DM composer — mobile / Despia only. Desktop renders a static dock.
 */
export function KeyboardAwareTexter({
  children,
  onKeyboardChange,
  onStackHeightChange,
  scrollContainerRef,
}: KeyboardAwareTexterProps) {
  const trackKeyboard = shouldTrackSoftKeyboard();

  if (!trackKeyboard) {
    return (
      <div className="texter-keyboard-aware texter-keyboard-aware--desktop" data-texter-dock>
        {children}
      </div>
    );
  }

  return (
    <MobileKeyboardAwareTexter
      onKeyboardChange={onKeyboardChange}
      onStackHeightChange={onStackHeightChange}
      scrollContainerRef={scrollContainerRef}
    >
      {children}
    </MobileKeyboardAwareTexter>
  );
}

function MobileKeyboardAwareTexter({
  children,
  onKeyboardChange,
  onStackHeightChange,
  scrollContainerRef,
}: KeyboardAwareTexterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const pollRef = useRef(0);
  const stackHRef = useRef(0);
  const rafPendingRef = useRef(0);

  const publishHeights = useCallback(() => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = requestAnimationFrame(() => {
      rafPendingRef.current = 0;
    const focused = document.activeElement;
    const typing =
      isTextInput(focused) ||
      (focused instanceof HTMLElement && focused.isContentEditable);
    const kb =
      typing || document.body.dataset.kbOpen === 'true'
        ? measureSoftKeyboardHeight()
        : 0;

    const root = document.documentElement;
    root.style.setProperty('--keyboard-height', `${kb}px`);
    root.style.setProperty('--kb-h', `${kb}px`);

    const stackH = rootRef.current?.offsetHeight ?? 0;
    if (Math.abs(stackH - stackHRef.current) > 0.5) {
      stackHRef.current = stackH;
      root.style.setProperty('--texter-stack-h', `${stackH}px`);
      onStackHeightChange?.(stackH);
    }

    onKeyboardChange?.(kb);

    const open = kb > KEYBOARD_INSET_THRESHOLD_PX;
    if (open) {
      document.body.dataset.kbOpen = 'true';
      if (!wasOpenRef.current) {
        scrollMessagesToBottom(scrollContainerRef?.current);
      }
    } else if (!typing) {
      delete document.body.dataset.kbOpen;
    }
    wasOpenRef.current = open;
    });
  }, [onKeyboardChange, onStackHeightChange, scrollContainerRef]);

  useEffect(() => {
    publishHeights();

    const vv = window.visualViewport;
    const onViewport = () => publishHeights();
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);

    const ro = new ResizeObserver(() => publishHeights());
    if (rootRef.current) ro.observe(rootRef.current);

    const startKeyboardPoll = () => {
      cancelAnimationFrame(pollRef.current);
      let frames = 0;
      const tick = () => {
        frames += 1;
        publishHeights();
        if (frames < 10) pollRef.current = requestAnimationFrame(tick);
      };
      pollRef.current = requestAnimationFrame(tick);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextInput(e.target) && !(e.target instanceof HTMLElement && e.target.isContentEditable)) {
        return;
      }
      document.body.dataset.kbOpen = 'true';
      scrollMessagesToBottom(scrollContainerRef?.current);
      startKeyboardPoll();
      publishHeights();
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        const focused = document.activeElement;
        const stillTyping =
          isTextInput(focused) ||
          (focused instanceof HTMLElement && focused.isContentEditable);
        if (!stillTyping) {
          delete document.body.dataset.kbOpen;
          document.documentElement.style.setProperty('--keyboard-height', '0px');
          document.documentElement.style.setProperty('--kb-h', '0px');
          wasOpenRef.current = false;
        }
        publishHeights();
      }, 100);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      cancelAnimationFrame(pollRef.current);
      if (rafPendingRef.current) cancelAnimationFrame(rafPendingRef.current);
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
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
