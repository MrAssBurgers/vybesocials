import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { isDespiaRuntime } from '@/lib/despiaBridge';

interface KeyboardAwareTexterProps {
  children: ReactNode;
  onKeyboardChange?: (keyboardHeight: number) => void;
  onStackHeightChange?: (height: number) => void;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

/** Touch-first / native shells — desktop never gets fake keyboard inset. */
function shouldTrackSoftKeyboard(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDespiaRuntime()) return true;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 768;
  return coarse || narrow;
}

function readCachedKeyboardHeight(): number {
  const fromRoot = getComputedStyle(document.documentElement).getPropertyValue('--kb-h').trim();
  return parseFloat(fromRoot) || 0;
}

function measureKeyboardHeight(): number {
  if (!shouldTrackSoftKeyboard()) return 0;

  const vv = window.visualViewport;
  if (vv) {
    const fromVv = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (fromVv > 48) return fromVv;
  }

  const shrink = Math.max(0, (window.screen.height || window.innerHeight) - window.innerHeight);
  if (shrink > 48) return shrink;

  const layoutGap = Math.max(0, window.innerHeight - document.documentElement.clientHeight);
  if (layoutGap > 48) return layoutGap;

  const cached = readCachedKeyboardHeight();
  if (cached > 48) return cached;

  const focused = document.activeElement;
  const typing =
    focused instanceof HTMLTextAreaElement ||
    focused instanceof HTMLInputElement ||
    (focused instanceof HTMLElement && focused.isContentEditable);

  if (typing && document.body.dataset.kbOpen === 'true') {
    return Math.round(window.innerHeight * (isDespiaRuntime() ? 0.42 : 0.36));
  }

  return 0;
}

function scrollMessagesToBottom(container: HTMLElement | null | undefined) {
  if (!container) return;
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function scrollComposerIntoView(root: HTMLElement | null | undefined) {
  if (!root || !shouldTrackSoftKeyboard()) return;
  requestAnimationFrame(() => {
    root.scrollIntoView({ block: 'end', behavior: 'smooth' });
  });
}

function isTextInput(el: EventTarget | null): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

/**
 * Keyboard-aware DM composer — moves with the soft keyboard on mobile/Despia only.
 */
export function KeyboardAwareTexter({
  children,
  onKeyboardChange,
  onStackHeightChange,
  scrollContainerRef,
}: KeyboardAwareTexterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const pollRef = useRef(0);
  const trackKeyboard = shouldTrackSoftKeyboard();

  const publishHeights = useCallback(() => {
    const focused = document.activeElement;
    const typing =
      isTextInput(focused) ||
      (focused instanceof HTMLElement && focused.isContentEditable);
    const kb =
      trackKeyboard && (typing || document.body.dataset.kbOpen === 'true')
        ? measureKeyboardHeight()
        : 0;

    const root = document.documentElement;
    root.style.setProperty('--keyboard-height', `${kb}px`);
    root.style.setProperty('--kb-h', `${kb}px`);

    const stackH = rootRef.current?.offsetHeight ?? 0;
    root.style.setProperty('--texter-stack-h', `${stackH}px`);

    onKeyboardChange?.(kb);
    onStackHeightChange?.(stackH);

    const open = kb > 0;
    if (open) {
      document.body.dataset.kbOpen = 'true';
      if (!wasOpenRef.current) {
        scrollMessagesToBottom(scrollContainerRef?.current);
      }
    } else if (!typing) {
      delete document.body.dataset.kbOpen;
    }
    wasOpenRef.current = open;
  }, [onKeyboardChange, onStackHeightChange, scrollContainerRef, trackKeyboard]);

  useEffect(() => {
    publishHeights();

    const vv = window.visualViewport;
    const onViewport = () => publishHeights();
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);

    const ro = new ResizeObserver(publishHeights);
    if (rootRef.current) ro.observe(rootRef.current);

    const startKeyboardPoll = () => {
      if (!trackKeyboard) return;
      cancelAnimationFrame(pollRef.current);
      let frames = 0;
      const tick = () => {
        frames += 1;
        publishHeights();
        if (frames < 24) pollRef.current = requestAnimationFrame(tick);
      };
      pollRef.current = requestAnimationFrame(tick);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextInput(e.target) && !(e.target instanceof HTMLElement && e.target.isContentEditable)) {
        return;
      }
      if (trackKeyboard) document.body.dataset.kbOpen = 'true';
      scrollMessagesToBottom(scrollContainerRef?.current);
      scrollComposerIntoView(rootRef.current);
      startKeyboardPoll();
      requestAnimationFrame(publishHeights);
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
  }, [publishHeights, scrollContainerRef, trackKeyboard]);

  return (
    <div ref={rootRef} className="texter-keyboard-aware" data-texter-dock>
      {children}
    </div>
  );
}
