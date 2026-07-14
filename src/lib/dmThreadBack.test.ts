import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestDmThreadBack,
  setDmThreadBackHandler,
  handleSystemBackForDm,
  tryCloseDmThreadOverlay,
} from './dmThreadBack';
import { clearDmLeaveSuppress, isDmLeaveSuppressActive } from './leaveDmConversation';
import { navigationRef } from './navigationRef';

afterEach(() => {
  setDmThreadBackHandler(null);
  clearDmLeaveSuppress();
  navigationRef.current = null;
  vi.restoreAllMocks();
});

describe('requestDmThreadBack', () => {
  it('closes overlay via handler without leave when handler returns true', () => {
    const navigate = vi.fn();
    navigationRef.current = navigate;
    setDmThreadBackHandler(() => true);
    requestDmThreadBack(navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(isDmLeaveSuppressActive()).toBe(false);
  });

  it('leaves via leaveDmConversation when no overlay', () => {
    const navigate = vi.fn();
    setDmThreadBackHandler(() => false);
    requestDmThreadBack(navigate);
    expect(navigate).toHaveBeenCalledWith('/messages', { replace: true });
    expect(isDmLeaveSuppressActive()).toBe(true);
  });
});

describe('handleSystemBackForDm', () => {
  it('returns false on non-thread routes', () => {
    window.history.replaceState({}, '', '/home');
    expect(handleSystemBackForDm()).toBe(false);
  });

  it('handles thread routes and sets suppress', () => {
    window.history.replaceState({}, '', '/messages/abc123');
    const navigate = vi.fn();
    navigationRef.current = navigate;
    expect(handleSystemBackForDm()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/messages', { replace: true });
    expect(isDmLeaveSuppressActive()).toBe(true);
  });
});

describe('tryCloseDmThreadOverlay', () => {
  it('returns false when no handler registered', () => {
    expect(tryCloseDmThreadOverlay()).toBe(false);
  });
});
