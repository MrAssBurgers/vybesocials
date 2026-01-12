import { useState, useCallback, useRef, useEffect } from 'react';

interface CallFallbackState {
  failureCount: number;
  showFallbackModal: boolean;
  lastFailureTime: number | null;
}

const FAILURE_RESET_WINDOW = 5 * 60 * 1000; // 5 minutes - reset failure count if no failures within this window
const FAILURES_TO_SHOW_FALLBACK = 2; // Show fallback after 2 failures

export function useCallFallback() {
  const [state, setState] = useState<CallFallbackState>({
    failureCount: 0,
    showFallbackModal: false,
    lastFailureTime: null,
  });

  // Persist failure count in session storage for cross-component access
  const storageKey = 'vybe_call_failure_count';

  useEffect(() => {
    // Load persisted failure count
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        
        // Reset if too much time has passed
        if (parsed.lastFailureTime && now - parsed.lastFailureTime > FAILURE_RESET_WINDOW) {
          sessionStorage.removeItem(storageKey);
        } else {
          setState(prev => ({
            ...prev,
            failureCount: parsed.failureCount || 0,
            lastFailureTime: parsed.lastFailureTime,
          }));
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const persistState = useCallback((newState: Partial<CallFallbackState>) => {
    const updated = { ...state, ...newState };
    setState(updated);
    
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        failureCount: updated.failureCount,
        lastFailureTime: updated.lastFailureTime,
      }));
    } catch {
      // Ignore storage errors
    }
  }, [state]);

  const recordFailure = useCallback((errorMessage?: string) => {
    const now = Date.now();
    const isNetworkRelated = 
      errorMessage?.toLowerCase().includes('network') ||
      errorMessage?.toLowerCase().includes('connection') ||
      errorMessage?.toLowerCase().includes('webrtc') ||
      errorMessage?.toLowerCase().includes('ice') ||
      errorMessage?.toLowerCase().includes('failed to connect') ||
      errorMessage?.toLowerCase().includes('permission');

    // Only count network-related failures
    if (!isNetworkRelated && errorMessage) {
      return false;
    }

    const newCount = state.failureCount + 1;
    const shouldShowFallback = newCount >= FAILURES_TO_SHOW_FALLBACK;

    persistState({
      failureCount: newCount,
      lastFailureTime: now,
      showFallbackModal: shouldShowFallback,
    });

    return shouldShowFallback;
  }, [state.failureCount, persistState]);

  const resetFailures = useCallback(() => {
    setState({
      failureCount: 0,
      showFallbackModal: false,
      lastFailureTime: null,
    });
    sessionStorage.removeItem(storageKey);
  }, []);

  const showFallbackModal = useCallback(() => {
    setState(prev => ({ ...prev, showFallbackModal: true }));
  }, []);

  const hideFallbackModal = useCallback(() => {
    setState(prev => ({ ...prev, showFallbackModal: false }));
  }, []);

  // Check if we should proactively show fallback (e.g., after recent failures)
  const shouldShowFallbackProactively = useCallback(() => {
    return state.failureCount >= FAILURES_TO_SHOW_FALLBACK;
  }, [state.failureCount]);

  return {
    failureCount: state.failureCount,
    showFallbackModal: state.showFallbackModal,
    recordFailure,
    resetFailures,
    showFallbackModalFn: showFallbackModal,
    hideFallbackModal,
    shouldShowFallbackProactively,
  };
}
