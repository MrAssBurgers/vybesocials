import { describe, expect, it } from 'vitest';
import type { Message } from '@/hooks/useMessages';
import {
  applyMessageSaveToggle,
  isMessageSenderId,
  isSavedByViewer,
  restoreExpiresAtOnUnsave,
} from '@/lib/messageSaveToggle';

const profileId = 'profile-me';
const authUid = 'auth-me';
const otherId = 'profile-other';

function baseMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: otherId,
    content: 'hello',
    media_url: null,
    media_type: null,
    message_type: 'text',
    view_mode: '24h',
    expires_at: null,
    is_deleted: false,
    reply_to_id: null,
    created_at: '2026-07-01T12:00:00.000Z',
    viewed_at: '2026-07-01T13:00:00.000Z',
    saved_by_sender: false,
    saved_by_recipient: false,
    ...overrides,
  };
}

describe('applyMessageSaveToggle', () => {
  it('toggles only the viewer save flag on save', () => {
    const msg = baseMessage();
    const saved = applyMessageSaveToggle(msg, profileId);
    expect(saved.saved_by_recipient).toBe(true);
    expect(saved.saved_by_sender).toBe(false);
    expect(saved.expires_at).toBeNull();
  });

  it('toggles only the viewer save flag on unsave without clearing the other party', () => {
    const msg = baseMessage({
      saved_by_sender: true,
      saved_by_recipient: true,
      expires_at: null,
    });
    const unsaved = applyMessageSaveToggle(msg, profileId);
    expect(unsaved.saved_by_recipient).toBe(false);
    expect(unsaved.saved_by_sender).toBe(true);
  });

  it('restores expires_at on unsave for 24h viewed messages', () => {
    const viewedAt = '2026-07-01T13:00:00.000Z';
    const msg = baseMessage({
      saved_by_recipient: true,
      expires_at: null,
      viewed_at: viewedAt,
    });
    const unsaved = applyMessageSaveToggle(msg, profileId);
    expect(unsaved.saved_by_recipient).toBe(false);
    expect(unsaved.expires_at).toBe(
      new Date(new Date(viewedAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('uses the sender save flag for migrated auth-uid messages', () => {
    const msg = baseMessage({
      sender_id: authUid,
      saved_by_sender: false,
      saved_by_recipient: true,
    });
    const saved = applyMessageSaveToggle(msg, profileId, authUid);
    expect(saved.saved_by_sender).toBe(true);
    expect(saved.saved_by_recipient).toBe(true);
  });
});

describe('isSavedByViewer', () => {
  it('detects sender vs recipient save state', () => {
    expect(
      isSavedByViewer(baseMessage({ sender_id: profileId, saved_by_sender: true }), profileId),
    ).toBe(true);
    expect(isSavedByViewer(baseMessage({ saved_by_recipient: true }), profileId)).toBe(true);
  });

  it('recognizes migrated auth-uid senders', () => {
    expect(isMessageSenderId(authUid, profileId, authUid)).toBe(true);
    expect(
      isSavedByViewer(
        baseMessage({ sender_id: authUid, saved_by_sender: true }),
        profileId,
        authUid,
      ),
    ).toBe(true);
  });
});

describe('restoreExpiresAtOnUnsave', () => {
  it('returns existing expires_at for non-24h messages', () => {
    const msg = baseMessage({ view_mode: 'permanent', expires_at: '2026-08-01T00:00:00.000Z' });
    expect(restoreExpiresAtOnUnsave(msg)).toBe('2026-08-01T00:00:00.000Z');
  });
});
