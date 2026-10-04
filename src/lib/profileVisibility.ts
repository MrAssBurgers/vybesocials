export const PROFILE_VISIBILITY_FIELDS = ['bio', 'followers', 'following', 'level', 'activity', 'location', 'posts', 'clips', 'stories', 'mutual_friends', 'vybe_dna'] as const;
export type ProfileVisibilityField = typeof PROFILE_VISIBILITY_FIELDS[number];
export const PROFILE_VISIBILITY_LEVELS = ['public', 'everyone', 'friends', 'close_friends', 'only_me', 'private'] as const;
export type ProfileVisibilityLevel = typeof PROFILE_VISIBILITY_LEVELS[number];
export const PROFILE_VISIBILITY_DEFAULTS: Record<ProfileVisibilityField, ProfileVisibilityLevel> = {
  bio: 'friends', followers: 'public', following: 'public', level: 'friends', activity: 'friends', location: 'friends',
  posts: 'public', clips: 'public', stories: 'friends', mutual_friends: 'friends', vybe_dna: 'friends',
};
export const isVisibilityLevel = (value: unknown): value is ProfileVisibilityLevel =>
  typeof value === 'string' && (PROFILE_VISIBILITY_LEVELS as readonly string[]).includes(value);
export const visibilityRow = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export interface ResolvedProfileVisibility {
  ok: true; ownerUid: string; viewerProfileId: string; targetProfileId: string;
  fields: Record<ProfileVisibilityField, boolean>;
  settings: Record<ProfileVisibilityField, ProfileVisibilityLevel | 'unavailable'>;
  isSelf: boolean; isFriend: boolean; isBlocked: boolean;
}
