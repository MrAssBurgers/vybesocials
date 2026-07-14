import { describe, expect, it, vi } from 'vitest';
import { isDmConversationPath, leaveDmConversation } from './leaveDmConversation';

describe('leaveDmConversation', () => {
  it('navigates to inbox with replace and clears data-dm-active', () => {
    document.documentElement.setAttribute('data-dm-active', 'true');
    const navigate = vi.fn();
    leaveDmConversation(navigate);
    expect(document.documentElement.getAttribute('data-dm-active')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/messages', { replace: true });
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
