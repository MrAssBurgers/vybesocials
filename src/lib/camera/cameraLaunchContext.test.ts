import { describe, expect, it } from 'vitest';
import {
  allowsStoryDestinations,
  captureTargetForContext,
  defaultDestinationForContext,
  hasPreselectedDestination,
  preselectedConversationId,
  preselectedRecipientIds,
  resolveReturnRoute,
  type CameraLaunchContext,
} from './cameraLaunchContext';

describe('defaultDestinationForContext', () => {
  it('honors an explicit defaultDestination', () => {
    expect(
      defaultDestinationForContext({ source: 'global', defaultDestination: 'clip' }),
    ).toBe('clip');
    expect(
      defaultDestinationForContext({ source: 'conversation', defaultDestination: 'story' }),
    ).toBe('story');
  });

  it('derives destination from source when not set', () => {
    expect(defaultDestinationForContext({ source: 'story' })).toBe('story');
    expect(defaultDestinationForContext({ source: 'create' })).toBe('post');
    expect(defaultDestinationForContext({ source: 'global' })).toBe('direct');
    expect(defaultDestinationForContext({ source: 'conversation' })).toBe('direct');
    expect(defaultDestinationForContext({ source: 'group' })).toBe('direct');
    expect(defaultDestinationForContext({ source: 'profile' })).toBe('direct');
  });
});

describe('captureTargetForContext', () => {
  it('maps destinations onto capture targets (recording limits)', () => {
    expect(captureTargetForContext({ source: 'story' })).toBe('story');
    expect(captureTargetForContext({ source: 'create' })).toBe('post');
    expect(
      captureTargetForContext({ source: 'create', defaultDestination: 'clip' }),
    ).toBe('clip');
    expect(captureTargetForContext({ source: 'conversation', conversationId: 'c1' })).toBe('dm');
    expect(captureTargetForContext({ source: 'group', groupId: 'g1' })).toBe('dm');
    expect(captureTargetForContext({ source: 'profile', profileId: 'p1' })).toBe('dm');
    expect(captureTargetForContext({ source: 'global' })).toBe('snap');
  });
});

describe('preselection', () => {
  it('resolves conversation or group preselection', () => {
    expect(preselectedConversationId({ source: 'conversation', conversationId: 'c1' })).toBe('c1');
    expect(preselectedConversationId({ source: 'group', groupId: 'g1' })).toBe('g1');
    expect(preselectedConversationId({ source: 'global' })).toBeNull();
  });

  it('dedupes recipient ids and includes profileId', () => {
    expect(
      preselectedRecipientIds({
        source: 'profile',
        profileId: 'p1',
        recipientIds: ['p1', 'p2'],
      }),
    ).toEqual(['p1', 'p2']);
  });

  it('detects preselected destinations', () => {
    expect(hasPreselectedDestination({ source: 'conversation', conversationId: 'c1' })).toBe(true);
    expect(hasPreselectedDestination({ source: 'profile', profileId: 'p1' })).toBe(true);
    expect(hasPreselectedDestination({ source: 'story' })).toBe(true);
    expect(hasPreselectedDestination({ source: 'global' })).toBe(false);
  });
});

describe('allowsStoryDestinations', () => {
  it('permits stories for global/story/create launches only', () => {
    expect(allowsStoryDestinations({ source: 'global' })).toBe(true);
    expect(allowsStoryDestinations({ source: 'story' })).toBe(true);
    expect(allowsStoryDestinations({ source: 'create' })).toBe(true);
    expect(allowsStoryDestinations({ source: 'conversation', conversationId: 'c1' })).toBe(false);
    expect(allowsStoryDestinations({ source: 'group', groupId: 'g1' })).toBe(false);
    expect(allowsStoryDestinations({ source: 'profile', profileId: 'p1' })).toBe(false);
  });

  it('allows an explicit story destination override for private sources', () => {
    expect(
      allowsStoryDestinations({ source: 'profile', profileId: 'p1', defaultDestination: 'story' }),
    ).toBe(true);
  });
});

describe('resolveReturnRoute', () => {
  it('always prefers an explicit returnRoute', () => {
    const ctx: CameraLaunchContext = {
      source: 'conversation',
      conversationId: 'c1',
      returnRoute: '/somewhere',
    };
    expect(resolveReturnRoute(ctx)).toBe('/somewhere');
  });

  it('returns to the conversation or group chat', () => {
    expect(resolveReturnRoute({ source: 'conversation', conversationId: 'c1' })).toBe('/messages/c1');
    expect(resolveReturnRoute({ source: 'group', groupId: 'g9' })).toBe('/messages/g9');
    expect(resolveReturnRoute({ source: 'conversation' })).toBe('/messages');
  });

  it('returns to Home for stories (StoriesBar lives on Home)', () => {
    expect(resolveReturnRoute({ source: 'story' })).toBe('/home');
  });

  it('returns to conversation or profile for profile launches', () => {
    expect(
      resolveReturnRoute({ source: 'profile', profileId: 'p1', conversationId: 'c2' }),
    ).toBe('/messages/c2');
    expect(resolveReturnRoute({ source: 'profile', profileId: 'p1' })).toBe('/profile/p1');
  });

  it('closes in place for global and create launches', () => {
    expect(resolveReturnRoute({ source: 'global' })).toBeNull();
    expect(resolveReturnRoute({ source: 'create' })).toBeNull();
  });
});
