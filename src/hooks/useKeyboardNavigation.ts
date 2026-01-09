import { useEffect, useCallback, useRef } from 'react';

interface KeyboardNavigationOptions {
  onEscape?: () => void;
  onEnter?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onTab?: (shiftKey: boolean) => void;
  onSpace?: () => void;
  enabled?: boolean;
}

export function useKeyboardNavigation(options: KeyboardNavigationOptions) {
  const {
    onEscape,
    onEnter,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onTab,
    onSpace,
    enabled = true,
  } = options;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Don't capture if user is typing in an input
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable;

    switch (e.key) {
      case 'Escape':
        onEscape?.();
        break;
      case 'Enter':
        if (!isInput) {
          onEnter?.();
        }
        break;
      case 'ArrowUp':
        if (!isInput) {
          e.preventDefault();
          onArrowUp?.();
        }
        break;
      case 'ArrowDown':
        if (!isInput) {
          e.preventDefault();
          onArrowDown?.();
        }
        break;
      case 'ArrowLeft':
        if (!isInput) {
          onArrowLeft?.();
        }
        break;
      case 'ArrowRight':
        if (!isInput) {
          onArrowRight?.();
        }
        break;
      case 'Tab':
        onTab?.(e.shiftKey);
        break;
      case ' ':
        if (!isInput) {
          e.preventDefault();
          onSpace?.();
        }
        break;
    }
  }, [enabled, onEscape, onEnter, onArrowUp, onArrowDown, onArrowLeft, onArrowRight, onTab, onSpace]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Hook for managing focus trap in modals
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isActive: boolean) {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element
    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [isActive, containerRef]);
}

// Hook for skip links (accessibility)
export function useSkipLinks() {
  const skipToMain = useCallback(() => {
    const main = document.querySelector('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus();
      main.removeAttribute('tabindex');
    }
  }, []);

  const skipToNav = useCallback(() => {
    const nav = document.querySelector('nav');
    if (nav) {
      const firstLink = nav.querySelector<HTMLElement>('a, button');
      firstLink?.focus();
    }
  }, []);

  return { skipToMain, skipToNav };
}

// Hook for roving tabindex in lists
export function useRovingTabIndex(
  containerRef: React.RefObject<HTMLElement>,
  selector: string = '[role="option"], [role="menuitem"], button'
) {
  const currentIndex = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = container.querySelectorAll<HTMLElement>(selector);
    
    // Initialize tabindex
    items.forEach((item, index) => {
      item.setAttribute('tabindex', index === 0 ? '0' : '-1');
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = container.querySelectorAll<HTMLElement>(selector);
      if (items.length === 0) return;

      let newIndex = currentIndex.current;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          newIndex = (currentIndex.current + 1) % items.length;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          newIndex = (currentIndex.current - 1 + items.length) % items.length;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = items.length - 1;
          break;
        default:
          return;
      }

      items[currentIndex.current]?.setAttribute('tabindex', '-1');
      items[newIndex]?.setAttribute('tabindex', '0');
      items[newIndex]?.focus();
      currentIndex.current = newIndex;
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, selector]);
}
