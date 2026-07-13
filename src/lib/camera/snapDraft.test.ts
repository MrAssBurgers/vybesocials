import { describe, expect, it } from 'vitest';
import {
  clientMessageIdFor,
  createSnapDraft,
  dmViewModeForDraft,
  optimisticTempIdFor,
} from './snapDraft';

describe('createSnapDraft', () => {
  it('creates a draft with defaults before upload', () => {
    const draft = createSnapDraft({
      localUri: 'blob:x',
      mediaType: 'photo',
      mediaId: 'm1',
      now: 1234,
    });
    expect(draft).toMatchObject({
      mediaId: 'm1',
      clientMessageId: 'snap-m1',
      localUri: 'blob:x',
      mediaType: 'photo',
      viewMode: 'view_once',
      recipientIds: [],
      conversationIds: [],
      storyDestinationIds: [],
      createdAt: 1234,
      uploadState: 'pending',
    });
  });

  it('dedupes destination ids', () => {
    const draft = createSnapDraft({
      localUri: 'blob:x',
      mediaType: 'video',
      conversationIds: ['c1', 'c1', 'c2'],
      recipientIds: ['p1', 'p1'],
      storyDestinationIds: ['my_story', 'my_story'],
    });
    expect(draft.conversationIds).toEqual(['c1', 'c2']);
    expect(draft.recipientIds).toEqual(['p1']);
    expect(draft.storyDestinationIds).toEqual(['my_story']);
  });

  it('generates unique media ids per capture', () => {
    const a = createSnapDraft({ localUri: 'blob:a', mediaType: 'photo' });
    const b = createSnapDraft({ localUri: 'blob:b', mediaType: 'photo' });
    expect(a.mediaId).not.toBe(b.mediaId);
  });
});

describe('idempotency keys', () => {
  it('is deterministic per draft + conversation (retry-safe)', () => {
    const draft = createSnapDraft({ localUri: 'blob:x', mediaType: 'photo', mediaId: 'm1' });
    expect(clientMessageIdFor(draft, 'c1')).toBe('snap-m1:c1');
    expect(clientMessageIdFor(draft, 'c1')).toBe(clientMessageIdFor(draft, 'c1'));
  });

  it('differs across conversations (one message per conversation)', () => {
    const draft = createSnapDraft({ localUri: 'blob:x', mediaType: 'photo', mediaId: 'm1' });
    expect(clientMessageIdFor(draft, 'c1')).not.toBe(clientMessageIdFor(draft, 'c2'));
  });

  it('derives matching optimistic temp ids', () => {
    const draft = createSnapDraft({ localUri: 'blob:x', mediaType: 'photo', mediaId: 'm1' });
    expect(optimisticTempIdFor(draft, 'c1')).toBe('temp-snap-m1:c1');
  });
});

describe('view modes', () => {
  it('passes server-allowed view modes through unchanged', () => {
    for (const mode of ['view_once', 'replay_once', '24h', 'permanent'] as const) {
      const draft = createSnapDraft({ localUri: 'blob:x', mediaType: 'photo', viewMode: mode });
      expect(dmViewModeForDraft(draft)).toBe(mode);
    }
  });
});
