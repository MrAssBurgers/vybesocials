import type {
  BirthdaySemanticState,
  FavoriteSemanticState,
  PrimaryRelationshipState,
  StreakSemanticState,
} from './relationshipTypes';

export type RelationshipEmojiPackId =
  | 'classic'
  | 'minimal'
  | 'cosmic'
  | 'cute'
  | 'symbols'
  | 'monochrome'
  | 'theme_match';

export const DEFAULT_RELATIONSHIP_EMOJIS: Record<PrimaryRelationshipState, string> = {
  best_friend: '😊',
  number_one: '💛',
  close_number_one: '❤️',
  forever_number_one: '💕',
  mutual_number_one: '😬',
  mutual_best_friend: '😎',
  rising_friend: '📈',
  new_close_friend: '✨',
  cooling_down: '🫥',
  friend: '',
};

export const DEFAULT_STREAK_EMOJIS: Record<Exclude<StreakSemanticState, null>, string> = {
  active: '🔥',
  warning: '⌛',
  expired: '',
  restoration_eligible: '🛟',
};

export const DEFAULT_BIRTHDAY_EMOJI = '🎂';
export const DEFAULT_FAVORITE_EMOJI = '💫';
export const DEFAULT_MUTUAL_FAVORITE_EMOJI = '💞';

export const RELATIONSHIP_STATE_LABELS: Record<PrimaryRelationshipState, string> = {
  forever_number_one: 'Forever Number One',
  close_number_one: 'Close Number One',
  number_one: 'Number One',
  best_friend: 'Best Friend',
  mutual_best_friend: 'Mutual Best Friend',
  mutual_number_one: 'Mutual Number One',
  rising_friend: 'Rising Friend',
  new_close_friend: 'New Close Friend',
  cooling_down: 'Cooling Down',
  friend: 'Friend',
};

export interface RelationshipEmojiPreferences {
  pack_id?: RelationshipEmojiPackId;
  states?: Partial<Record<PrimaryRelationshipState, string>>;
  streak?: Partial<Record<Exclude<StreakSemanticState, null>, string>>;
  birthday?: string;
  favorite?: string;
  mutual_favorite?: string;
  show_cooling_down?: boolean;
}

export function resolveRelationshipEmoji(
  state: PrimaryRelationshipState | null | undefined,
  prefs?: RelationshipEmojiPreferences | null,
): string {
  if (!state || state === 'friend') return '';
  const custom = prefs?.states?.[state];
  if (custom) return custom;
  return DEFAULT_RELATIONSHIP_EMOJIS[state] || '';
}

export function resolveStreakDisplay(
  count: number,
  streakState: StreakSemanticState,
  prefs?: RelationshipEmojiPreferences | null,
): string {
  if (!count || count <= 0 || !streakState || streakState === 'expired') return '';
  const emoji =
    prefs?.streak?.[streakState] ??
    (streakState === 'active' || streakState === 'warning'
      ? DEFAULT_STREAK_EMOJIS[streakState]
      : DEFAULT_STREAK_EMOJIS[streakState]);
  return `${emoji} ${count}`;
}

export function resolveBirthdayEmoji(
  birthdayState: BirthdaySemanticState,
  prefs?: RelationshipEmojiPreferences | null,
): string {
  if (!birthdayState) return '';
  return prefs?.birthday || DEFAULT_BIRTHDAY_EMOJI;
}

export function resolveFavoriteEmoji(
  favoriteState: FavoriteSemanticState,
  prefs?: RelationshipEmojiPreferences | null,
): string {
  if (!favoriteState) return '';
  if (favoriteState === 'mutual_pinned') {
    return prefs?.mutual_favorite || DEFAULT_MUTUAL_FAVORITE_EMOJI;
  }
  return prefs?.favorite || DEFAULT_FAVORITE_EMOJI;
}

/** Display priority: birthday → milestone → streak warning → primary → favorite */
export function pickPrimaryInboxEmoji(input: {
  primaryState?: PrimaryRelationshipState | null;
  birthdayState?: BirthdaySemanticState;
  streakState?: StreakSemanticState;
  favoriteState?: FavoriteSemanticState;
  prefs?: RelationshipEmojiPreferences | null;
}): string {
  const birthday = resolveBirthdayEmoji(input.birthdayState ?? null, input.prefs);
  if (birthday) return birthday;

  const primary = resolveRelationshipEmoji(input.primaryState, input.prefs);
  if (primary) return primary;

  if (input.streakState === 'warning') {
    return input.prefs?.streak?.warning || DEFAULT_STREAK_EMOJIS.warning;
  }

  const favorite = resolveFavoriteEmoji(input.favoriteState ?? null, input.prefs);
  if (favorite && !primary) return favorite;

  return primary;
}
