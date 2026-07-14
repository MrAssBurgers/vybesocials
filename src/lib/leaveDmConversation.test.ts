import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDmLeaveSuppress,
  isDmConversationPath,
  isDmLeaveSuppressActive,
  leaveDmConversation,
  DM_LEAVE_SUPPRESS_KEY,
  DM_LEAVE_SUPPRESS_MS,
} from './leaveDmConversation';

afterEach(() => {
  clearDmLeaveSuppress();
  vi.useRealTimers();
});

describe('leaveDmConversation', () => {
  it('navigates to inbox with replace and clears data-dm-active', () => {
    document.documentElement.setAttribute('data-dm-active', 'true');
    const navigate = vi.fn();
    leaveDmConversation(navigate);
    expect(document.documentElement.getAttribute('data-dm-active')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/messages', { replace: true });
  });

  it('sets a leave suppress window so openChat can no-op', () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    leaveDmConversation(navigate);
    expect(isDmLeaveSuppressActive()).toBe(true);
    expect(Number(sessionStorage.getItem(DM_LEAVE_SUPPRESS_KEY))).toBeGreaterThan(Date.now());
    vi.advanceTimersByTime(DM_LEAVE_SUPPRESS_MS + 1);
    expect(isDmLeaveSuppressActive()).toBe(false);
  });
});

describe('isDmLeaveSuppressActive', () => {
  it('returns false when no suppress is set', () => {
    expect(isDmLeaveSuppressActive()).toBe(false);
  });
});

describe('isDmConversationPath', () => {
  it('detects thread paths', () => {
    expect(isDmConversationPath('/messages/abc123')).toBe(true);
    expect(isDmConversationPath('/messages/abc123?camera=1')).toBe(true);
  });

  it('ignores inbox and sibling routes', () => {
    expect(isDmConversationPath('/messages')).toBe(false);
    expect(isDmConversationPath('/messages/')).toBe(false);
    expect(isDmConversationPath('/messages/search')).toBe(false);
    expect(isDmConversationPath('/messages/requests')).toBe(false);
    expect(isDmConversationPath('/messages/new')).toBe(false);
    expect(isDmConversationPath('/home')).toBe(false);
  });
});
