// VYBE Reaction System - Facebook-style reactions with premium flair

export type ReactionType = 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry';

export interface ReactionConfig {
  type: ReactionType;
  emoji: string;
  label: string;
  color: string; // HSL color for glow/accent
  activeColor: string; // Tailwind class for active state
  sound: 'pop' | 'success' | 'tap';
}

export const REACTIONS: ReactionConfig[] = [
  { type: 'like',  emoji: '👍', label: 'Like',  color: '217 91% 60%',  activeColor: 'text-blue-500',   sound: 'pop' },
  { type: 'love',  emoji: '❤️', label: 'Love',  color: '0 84% 60%',    activeColor: 'text-red-500',    sound: 'success' },
  { type: 'care',  emoji: '🥰', label: 'Care',  color: '25 95% 53%',   activeColor: 'text-orange-400', sound: 'success' },
  { type: 'haha',  emoji: '😂', label: 'Haha',  color: '45 93% 47%',   activeColor: 'text-yellow-500', sound: 'pop' },
  { type: 'wow',   emoji: '😮', label: 'Wow',   color: '45 93% 47%',   activeColor: 'text-yellow-500', sound: 'pop' },
  { type: 'sad',   emoji: '😢', label: 'Sad',   color: '45 93% 47%',   activeColor: 'text-yellow-500', sound: 'tap' },
  { type: 'angry', emoji: '😡', label: 'Angry', color: '15 90% 55%',   activeColor: 'text-orange-600', sound: 'tap' },
];

export function getReaction(type: ReactionType): ReactionConfig {
  return REACTIONS.find(r => r.type === type) || REACTIONS[0];
}

// Get the dominant reaction from a list of reaction types
export function getDominantReactions(reactionTypes: ReactionType[]): ReactionConfig[] {
  const counts = new Map<ReactionType, number>();
  for (const type of reactionTypes) {
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => getReaction(type));
}
