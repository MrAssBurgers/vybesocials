import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { isNativeAppShell, getRuntimeOs } from '@/lib/despiaBridge';

/**
 * Scale auth content to fit the viewport without clipping.
 * Prefer CSS `zoom` over `transform: scale()` — WebKit (iOS Cap/Despia WKWebView)
 * paints the text caret in untransformed coordinates, so a parent transform puts
 * the caret left of / mid-field relative to the visual input.
 */
export function useAuthScreenFit(enabled: boolean, ...deps: unknown[]) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fieldFocused, setFieldFocused] = useState(false);
  const lastScaleRef = useRef(1);
  // iOS WebView: visualViewport height wobbles during rubber-band / keyboard —
  // using it for live scale made the entire auth card crawl. Prefer stable layout height.
  const calmIos = isNativeAppShell() || (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent));

  // Touch screens scroll at natural size. Repeatedly unscaling the card to
  // measure it during keyboard/viewport events forces synchronous layout.
  const naturalTouchLayout = calmIos || (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const fitEnabled = enabled && !naturalTouchLayout;

  const fitToViewport = useCallback(() => {
    const el = contentRef.current;
    if (!el || !fitEnabled) {
      if (lastScaleRef.current !== 1) {
        lastScaleRef.current = 1;
        setScale(1);
      }
      return;
    }

    // Measure natural size without the current zoom/fit.
    const prevZoom = el.style.zoom;
    const prevTransform = el.style.transform;
    el.style.zoom = '1';
    el.style.transform = 'none';
    const naturalHeight = el.getBoundingClientRect().height;
    el.style.zoom = prevZoom;
    el.style.transform = prevTransform;
    if (!naturalHeight) return;

    const viewportHeight = calmIos
      ? window.innerHeight
      : (window.visualViewport?.height ?? window.innerHeight);
    const available = Math.max(280, viewportHeight - 16);
    const nextScale = naturalHeight > available ? Math.min(1, available / naturalHeight) : 1;
    // Ignore sub-pixel thrash from soft keyboard / bounce.
    if (Math.abs(nextScale - lastScaleRef.current) < 0.02) return;
    lastScaleRef.current = nextScale;
    setScale(nextScale);
  }, [fitEnabled, calmIos]);

  useLayoutEffect(() => {
    if (!fitEnabled) {
      lastScaleRef.current = 1;
      setScale(1);
      return;
    }

    fitToViewport();
    const raf = requestAnimationFrame(fitToViewport);
    const afterMotion = window.setTimeout(fitToViewport, 400);

    window.addEventListener('resize', fitToViewport);
    window.addEventListener('orientationchange', fitToViewport);
    // Skip visualViewport on iOS native — it fires constantly while typing/overscrolling.
    if (!calmIos) {
      window.visualViewport?.addEventListener('resize', fitToViewport);
    }

    const observer = new ResizeObserver(fitToViewport);
    const el = contentRef.current;
    if (el) observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(afterMotion);
      window.removeEventListener('resize', fitToViewport);
      window.removeEventListener('orientationchange', fitToViewport);
      if (!calmIos) {
        window.visualViewport?.removeEventListener('resize', fitToViewport);
      }
      observer.disconnect();
    };
  }, [fitEnabled, fitToViewport, calmIos, ...deps]);

  // While typing, force 1× so caret + soft keyboard never fight a shrink fit.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !enabled) {
      setFieldFocused(false);
      return;
    }
    const isField = (node: EventTarget | null) => {
      if (!(node instanceof HTMLElement)) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };
    const onFocusIn = (e: FocusEvent) => {
      if (isField(e.target)) setFieldFocused(true);
    };
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (!isField(document.activeElement) || !el.contains(document.activeElement)) {
          setFieldFocused(false);
        }
      });
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [enabled, ...deps]);

  // Apply shrink only when not focused.
  // [iOS-only] use CSS zoom (transform breaks WK caret).
  // [Android-only] use transform: scale — Chrome WebView often ignores CSS zoom.
  const visualScale = fieldFocused ? 1 : scale;
  const useTransformFit = getRuntimeOs() === 'android';
  return {
    contentRef,
    scale: visualScale,
    useTransformFit,
    scrollWhenTall: naturalTouchLayout || fieldFocused,
  };
}

