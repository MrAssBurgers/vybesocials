/**
 * DNA Perks — real, functional bonuses derived from VYBE DNA personality vector.
 * 
 * Three archetypes:
 *   - Power User (activity dominant): XP surge, challenge priority, streak shield
 *   - Connector (social dominant): social boost, gift bonus, reaction power
 *   - Creator (creative dominant): creator spotlight, token multiplier, exclusive cosmetics
 * 
 * Perks scale with the dominant trait score (0–1). Higher score → stronger perks.
 */

export type Archetype = 'activity' | 'social' | 'creative';

export interface DNAPerkValues {
  archetype: Archetype;
  archetypeName: string;
  dominantScore: number; // 0-1

  // Power User perks
  xpMultiplier: number;           // e.g. 1.15 = +15%
  streakGraceHours: number;       // extra hours before streak breaks
  challengePriority: boolean;     // early access to challenges

  // Connector perks
  socialBoostPercent: number;     // % boost in friend suggestions
  giftBonusPercent: number;       // % extra tokens when gifting
  reactionXpBonus: number;        // extra XP given to creators on reaction

  // Creator perks
  feedBoostPercent: number;       // % boost in discovery feed
  tokenMultiplier: number;        // e.g. 1.15 = +15%
  exclusiveCosmetics: boolean;    // access to creator-only items
}

export function getDominantTrait(pv: Record<string, number>): Archetype {
  const a = pv.activity ?? 0;
  const s = pv.social ?? 0;
  const c = pv.creative ?? 0;
  if (a >= s && a >= c) return 'activity';
  if (s >= a && s >= c) return 'social';
  return 'creative';
}

const ARCHETYPE_NAMES: Record<Archetype, string> = {
  activity: 'Power User',
  social: 'Connector',
  creative: 'Creator',
};

/**
 * Compute real perk values from a personality vector.
 * Every user gets perks — stronger DNA = stronger perks.
 */
export function computeDNAPerks(personalityVector: Record<string, number>): DNAPerkValues {
  const archetype = getDominantTrait(personalityVector);
  const score = personalityVector[archetype] ?? 0;

  // Scale perks: minimum baseline at score=0, max at score=1
  // Perk strength = base + (score * scaling)
  const scale = (base: number, max: number) => base + score * (max - base);

  return {
    archetype,
    archetypeName: ARCHETYPE_NAMES[archetype],
    dominantScore: score,

    // Power User — everyone gets a small xp bonus, activity types get more
    xpMultiplier: archetype === 'activity' ? scale(1.05, 1.25) : scale(1.0, 1.08),
    streakGraceHours: archetype === 'activity' ? Math.round(scale(1, 4)) : 0,
    challengePriority: archetype === 'activity' && score >= 0.3,

    // Connector — social types get discovery & gifting boosts
    socialBoostPercent: archetype === 'social' ? Math.round(scale(5, 30)) : Math.round(scale(0, 8)),
    giftBonusPercent: archetype === 'social' ? Math.round(scale(5, 20)) : 0,
    reactionXpBonus: archetype === 'social' ? Math.round(scale(1, 8)) : Math.round(scale(0, 2)),

    // Creator — creative types get feed & token boosts
    feedBoostPercent: archetype === 'creative' ? Math.round(scale(5, 35)) : Math.round(scale(0, 8)),
    tokenMultiplier: archetype === 'creative' ? scale(1.05, 1.25) : scale(1.0, 1.05),
    exclusiveCosmetics: archetype === 'creative' && score >= 0.3,
  };
}

/**
 * Get the formatted perk list for display in the DNA Perks card.
 * Returns the 3 perks relevant to the user's archetype with real computed values.
 */
export function getDisplayPerks(perks: DNAPerkValues) {
  const perksByArchetype = {
    activity: [
      {
        icon: 'Zap' as const,
        title: 'XP Surge',
        description: 'Bonus XP from all activities',
        value: `+${Math.round((perks.xpMultiplier - 1) * 100)}%`,
        active: perks.xpMultiplier > 1,
      },
      {
        icon: 'Target' as const,
        title: 'Challenge Priority',
        description: 'Early access to new challenges',
        value: perks.challengePriority ? 'Active' : 'Locked',
        active: perks.challengePriority,
      },
      {
        icon: 'TrendingUp' as const,
        title: 'Streak Shield',
        description: 'Extended streak grace period',
        value: perks.streakGraceHours > 0 ? `+${perks.streakGraceHours}hrs` : 'Locked',
        active: perks.streakGraceHours > 0,
      },
    ],
    social: [
      {
        icon: 'Users' as const,
        title: 'Social Boost',
        description: 'Higher visibility in friend suggestions',
        value: `+${perks.socialBoostPercent}%`,
        active: perks.socialBoostPercent > 0,
      },
      {
        icon: 'Gift' as const,
        title: 'Gift Bonus',
        description: 'Extra tokens when gifting friends',
        value: perks.giftBonusPercent > 0 ? `+${perks.giftBonusPercent}%` : 'Locked',
        active: perks.giftBonusPercent > 0,
      },
      {
        icon: 'Sparkles' as const,
        title: 'Reaction Power',
        description: 'Reactions give extra XP to creators',
        value: perks.reactionXpBonus > 0 ? `+${perks.reactionXpBonus} XP` : 'Locked',
        active: perks.reactionXpBonus > 0,
      },
    ],
    creative: [
      {
        icon: 'Sparkles' as const,
        title: 'Creator Spotlight',
        description: 'Posts boosted in discovery feed',
        value: `+${perks.feedBoostPercent}%`,
        active: perks.feedBoostPercent > 0,
      },
      {
        icon: 'TrendingUp' as const,
        title: 'Token Multiplier',
        description: 'Earn more tokens from content',
        value: `+${Math.round((perks.tokenMultiplier - 1) * 100)}%`,
        active: perks.tokenMultiplier > 1,
      },
      {
        icon: 'Gift' as const,
        title: 'Exclusive Cosmetics',
        description: 'Access to creator-only items',
        value: perks.exclusiveCosmetics ? 'Unlocked' : 'Locked',
        active: perks.exclusiveCosmetics,
      },
    ],
  };

  return perksByArchetype[perks.archetype];
}
