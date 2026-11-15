import { describe, expect, it } from 'vitest';
import { dmConversationPreviewText } from './dmPreviewText';
import { mapInboxEntryDoc, projectionToLoadedConversation } from './dmInboxProjection';
import { patchProjectionOntoLegacy } from './dmInboxProjectionMerge';
import type { Message } from '@/hooks/useMessages';
import type { LoadedDMConversation } from './loadDMConversations';

const projected = (text: string, type = 'text') => projectionToLoadedConversation(mapInboxEntryDoc('viewer_chat', {
  viewer_id: 'viewer', conversation_id: 'chat', preview_text: text,
  latest_sender_id: 'viewer', latest_message_id: 'message',
  latest_message_at: '2026-11-14T20:00:00Z', latest_message_type: type,
}));
const preview = (conversation: LoadedDMConversation) => dmConversationPreviewText({
  lastMessage: conversation.last_message, profileId: 'viewer', previewMaxLen: 48,
});

describe('formatted inbox projection previews', () => {
  it('keeps one sender prefix after projection and legacy merge', () => {
    const legacy = { id: 'chat', members: [], last_message: null } as unknown as LoadedDMConversation;
    expect(preview(patchProjectionOntoLegacy(legacy, projected('You: Hello')))).toBe('You: Hello');
  });

  it('preserves the server formatted media label', () => {
    expect(preview(projected('You sent a photo', 'image'))).toBe('You sent a photo');
  });

  it('preserves a raw message that intentionally begins with You:', () => {
    expect(dmConversationPreviewText({ lastMessage: {
      sender_id: 'viewer', content: 'You: a literal quote', message_type: 'text',
    } as Message, profileId: 'viewer' })).toBe('You: You: a literal quote');
  });
});
