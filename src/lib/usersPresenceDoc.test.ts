import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/firestoreDb', () => ({
  documentRef: vi.fn(),
  onSnapshot: vi.fn(),
  setDocument: vi.fn(),
}));

import { uiActivityFromState } from './presenceActivity';
import { toUiActivity, type UserPresenceDoc } from './usersPresenceDoc';

function doc(patch: Partial<UserPresenceDoc> = {}): UserPresenceDoc {
  const now = new Date().toISOString();
  return {
    id: 'qa1',
    user_id: 'qa1',
    online: true,
    last_seen: now,
    active_conversation: null,
    typing_in: null,
    recording_in: null,
    uploading_in: null,
    in_call: false,
    current_activity: 'online',
    updated_at: now,
    ...patch,
  };
}

describe('scoped presence', () => {
  it('keeps a fresh active person online when they are not inside this thread', () => {
    expect(toUiActivity(doc({ active_conversation: 'other-chat' }), 'this-chat')).toBe('online');
    expect(uiActivityFromState('online')).toBe('idle');
    expect(toUiActivity(doc({ active_conversation: 'this-chat', current_activity: 'viewing' }), 'this-chat')).toBe('viewing');
    expect(toUiActivity(doc({ online: false }), 'this-chat')).toBe('offline');
    const stale = new Date(Date.now() - 60_000).toISOString();
    expect(toUiActivity(doc({ updated_at: stale, last_seen: stale }), 'this-chat')).toBe('offline');
  });
});
