// Reaction-to-Mood Intelligence System
// Maps emoji reactions to content mood signals for personalized feed ranking
// Each reaction tells the algorithm what kind of content the user enjoys

import type { ReactionType } from './reactions';

export type ContentMood = 
  | 'funny'         // 😂 haha, 😮 wow → comedy, humor, memes
  | 'heartfelt'     // ❤️ love, 🥰 care, 😢 sad → emotional, touching
  | 'shocking'      // 😮 wow → surprising, unexpected, jaw-dropping
  | 'informative'   // 👍 like → educational, useful, tips
  | 'controversial' // 😡 angry → debate, hot takes, polarizing
  | 'inspiring'     // ❤️ love, 👍 like → motivational, uplifting
  | 'sad';          // 😢 sad, 🥰 care → emotional, empathetic

/**
 * Maps each reaction type to the content moods it signals.
 * When a user reacts with 😂, the system learns they enjoy funny content
 * and pushes more funny-mood posts to their feed.
 * 
 * Mapping rationale:
 * - 😂 Haha → funny (primary signal for humor)
 * - ❤️ Love → heartfelt + inspiring (emotional connection)
 * - 🥰 Care → heartfelt + sad (empathy signal)
 * - 😮 Wow → shocking + funny (surprise/delight)
 * - 😢 Sad → sad + heartfelt (emotional depth)
 * - 😡 Angry → controversial (engagement with debate)
 * - 👍 Like → informative + inspiring (general approval)
 */
export const REACTION_MOOD_MAP: Record<ReactionType, ContentMood[]> = {
  haha:  ['funny'],
  love:  ['heartfelt', 'inspiring'],
  care:  ['heartfelt', 'sad'],
  wow:   ['shocking', 'funny'],
  sad:   ['sad', 'heartfelt'],
  angry: ['controversial'],
  like:  ['informative', 'inspiring'],
};

/**
 * Content mood metadata for UI display and analytics
 */
export const MOOD_META: Record<ContentMood, { label: string; emoji: string; description: string }> = {
  funny:         { label: 'Funny',         emoji: '😂', description: 'Comedy, humor, memes' },
  heartfelt:     { label: 'Heartfelt',     emoji: '❤️', description: 'Emotional, touching stories' },
  shocking:      { label: 'Shocking',      emoji: '😮', description: 'Surprising, unexpected content' },
  informative:   { label: 'Informative',   emoji: '📚', description: 'Educational, tips, how-tos' },
  controversial: { label: 'Hot Takes',     emoji: '🔥', description: 'Debate, opinions, polarizing' },
  inspiring:     { label: 'Inspiring',     emoji: '✨', description: 'Motivational, uplifting' },
  sad:           { label: 'Emotional',     emoji: '😢', description: 'Moving, empathetic content' },
};

/**
 * Feed-ranking mood bucket (matches production `reaction_mood_profiles` + `post_mood_signals`).
 * Each reaction steers the algorithm toward a different content lane.
 */
export type FeedMood =
  | 'general'       // 👍 like — default discovery / uplifting
  | 'heartwarming'  // ❤️ love — warm, inspiring posts
  | 'supportive'    // 🥰 care — caring, empathetic content
  | 'funny'         // 😂 haha
  | 'shocking'      // 😮 wow
  | 'emotional'     // 😢 sad
  | 'controversial'; // 😡 angry

/** Primary feed lane each reaction activates. */
export const REACTION_FEED_MOOD: Record<ReactionType, FeedMood> = {
  like:  'general',
  love:  'heartwarming',
  care:  'supportive',
  haha:  'funny',
  wow:   'shocking',
  sad:   'emotional',
  angry: 'controversial',
};

export function getFeedMoodForReaction(reaction: ReactionType): FeedMood {
  return REACTION_FEED_MOOD[reaction] || 'general';
}

/** Cold-start defaults — love/general lane until the user builds a profile. */
export const DEFAULT_FEED_MOOD_WEIGHTS: Record<FeedMood, number> = {
  general: 1,
  heartwarming: 1,
  supportive: 0,
  funny: 0,
  shocking: 0,
  emotional: 0,
  controversial: 0,
};

/** Get the mood signals for a given reaction type */
export function getMoodsForReaction(reaction: ReactionType): ContentMood[] {
  return REACTION_MOOD_MAP[reaction] || ['informative'];
}

/**
 * Get the primary mood for a reaction (first in the array = strongest signal)
 */
export function getPrimaryMood(reaction: ReactionType): ContentMood {
  return REACTION_MOOD_MAP[reaction]?.[0] || 'informative';
}
