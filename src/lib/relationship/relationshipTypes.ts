export type PrimaryRelationshipState =
  | 'forever_number_one'
  | 'close_number_one'
  | 'number_one'
  | 'best_friend'
  | 'mutual_best_friend'
  | 'mutual_number_one'
  | 'rising_friend'
  | 'new_close_friend'
  | 'cooling_down'
  | 'friend';

export type StreakSemanticState =
  | 'active'
  | 'warning'
  | 'expired'
  | 'restoration_eligible'
  | null;

export type BirthdaySemanticState = 'today' | 'this_week' | null;

export type FavoriteSemanticState = 'pinned' | 'mutual_pinned' | null;

export interface InboxRelationshipProjection {
  primary_relationship_state?: PrimaryRelationshipState | null;
  best_friend_rank?: number | null;
  relationship_title?: string | null;
  streak_count?: number;
  streak_state?: StreakSemanticState;
  birthday_state?: BirthdaySemanticState;
  favorite_state?: FavoriteSemanticState;
}
