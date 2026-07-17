import { describe, expect, it } from 'vitest';
import {
  displayNameForConversation,
  inferOtherUserIdFromConversation,
  isViewerMember,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';

describe('isViewerMember', () => {
  it('treats profile id and auth uid as the viewer', () => {
    expect(isViewerMember('profile-1', 'profile-1', 'auth-1')).toBe(true);
    expect(isViewerMember('auth-1', 'profile-1', 'auth-1')).toBe(true);
    expect(isViewerMember('other', 'profile-1', 'auth-1')).toBe(false);
  });
});

describe('resolveOtherMemberFromConversation', () => {
  const viewerProfile = 'profile-me';
  const viewerAuth = 'auth-me';

  const conversation = {
    id: `${viewerProfile}_profile-other`,
    member_ids: [viewerProfile, 'profile-other'],
    members: [
      {
        user_id: viewerProfile,
        profile: { id: viewerProfile, username: 'me', avatar_url: 'https://cdn/me.jpg' },
      },
      {
        user_id: viewerAuth,
        profile: { id: viewerProfile, username: 'me', avatar_url: 'https://cdn/me.jpg' },
      },
      {
        user_id: 'profile-other',
        profile: { id: 'profile-other', username: 'bob', avatar_url: 'https://cdn/bob.jpg' },
      },
    ],
  };

  it('returns the non-viewer member even when viewer has duplicate auth row', () => {
    const other = resolveOtherMemberFromConversation(conversation, viewerProfile, viewerAuth);
    expect(other?.user_id).toBe('profile-other');
    expect(other?.profile?.username).toBe('bob');
    expect(other?.profile?.avatar_url).toBe('https://cdn/bob.jpg');
  });

  it('does not pick the viewer auth uid row as the other participant', () => {
    const other = resolveOtherMemberFromConversation(conversation, viewerProfile, viewerAuth);
    expect(other?.profile?.avatar_url).not.toBe('https://cdn/me.jpg');
  });

  it('resolves display name from the other profile', () => {
    expect(displayNameForConversation(conversation, viewerProfile, viewerAuth)).toBe('bob');
  });

  it('infers other user id from member_ids when members sparse', () => {
    const sparse = {
      id: `${viewerProfile}_profile-other`,
      member_ids: [viewerProfile, 'profile-other'],
      members: [{ user_id: viewerProfile, profile: null }],
    };
    expect(inferOtherUserIdFromConversation(sparse, viewerProfile, viewerAuth)).toBe('profile-other');
  });

  it('parses a_b conversation id against auth uid without picking self', () => {
    const authKeyed = {
      id: `${viewerAuth}_profile-other`,
      member_ids: [viewerAuth, viewerProfile, 'profile-other'],
      members: [
        { user_id: viewerAuth, profile: { id: viewerProfile, username: 'me' } },
        { user_id: viewerProfile, profile: { id: viewerProfile, username: 'me' } },
      ],
    };
    expect(inferOtherUserIdFromConversation(authKeyed, viewerProfile, viewerAuth)).toBe(
      'profile-other',
    );
  });
});
