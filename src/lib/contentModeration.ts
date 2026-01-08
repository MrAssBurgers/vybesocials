import { z } from 'zod';

// Comprehensive profanity/slur list - this is a first line of defense
// For production, use AI moderation APIs for better coverage
const BLOCKED_WORDS = [
  // Common profanity
  'fuck', 'fucking', 'fucked', 'fucker', 'fucks',
  'shit', 'shitting', 'shitty',
  'ass', 'asshole', 'asses',
  'bitch', 'bitches', 'bitching',
  'damn', 'damned', 'dammit',
  'crap', 'crappy',
  'bastard', 'bastards',
  'cunt', 'cunts',
  'dick', 'dicks',
  'piss', 'pissed', 'pissing',
  'whore', 'whores',
  'slut', 'sluts',
  'bullshit',
  
  // Racial slurs (critical to block)
  'nigger', 'nigga', 'niggers', 'niggas',
  'chink', 'chinks',
  'spic', 'spics',
  'kike', 'kikes',
  'wetback', 'wetbacks',
  'gook', 'gooks',
  'beaner', 'beaners',
  'cracker', 'crackers',
  
  // Homophobic/transphobic slurs
  'faggot', 'faggots', 'fag', 'fags',
  'dyke', 'dykes',
  'tranny', 'trannies',
  'homo', 'homos',
  
  // Ableist slurs
  'retard', 'retards', 'retarded',
  
  // Sexual harassment
  'rape', 'raping', 'rapist',
];

// Common obfuscation patterns
const OBFUSCATION_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  '5': 's',
  '$': 's',
  '7': 't',
  '+': 't',
};

/**
 * Normalize text to detect obfuscated words
 */
function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  
  // Replace obfuscation characters
  for (const [char, replacement] of Object.entries(OBFUSCATION_MAP)) {
    normalized = normalized.replace(new RegExp('\\' + char, 'g'), replacement);
  }
  
  // Remove repeated characters (e.g., "fuuuck" -> "fuck")
  normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');
  
  // Remove spaces between letters (e.g., "f u c k" -> "fuck")
  normalized = normalized.replace(/\s+/g, '');
  
  return normalized;
}

/**
 * Check if text contains blocked words
 */
export function containsBlockedContent(text: string): { blocked: boolean; matches: string[] } {
  const normalizedText = normalizeText(text);
  const matches: string[] = [];
  
  for (const word of BLOCKED_WORDS) {
    // Check normalized text for the word
    if (normalizedText.includes(word)) {
      matches.push(word);
    }
    
    // Also check original text (case insensitive)
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(text)) {
      if (!matches.includes(word)) {
        matches.push(word);
      }
    }
  }
  
  return {
    blocked: matches.length > 0,
    matches,
  };
}

/**
 * Filter/censor blocked content from text
 */
export function filterBlockedContent(text: string): string {
  let filtered = text;
  
  for (const word of BLOCKED_WORDS) {
    // Replace with asterisks (case insensitive, word boundary aware)
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  }
  
  return filtered;
}

/**
 * Validate user-generated content
 */
export const contentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Content cannot be empty')
    .max(5000, 'Content is too long')
    .refine(
      (text) => !containsBlockedContent(text).blocked,
      {
        message: 'Your content contains inappropriate language. Please revise.',
      }
    ),
});

/**
 * Validate username
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be less than 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
  .refine(
    (username) => !containsBlockedContent(username).blocked,
    {
      message: 'This username is not allowed',
    }
  );

/**
 * Validate display name
 */
export const displayNameSchema = z
  .string()
  .trim()
  .max(50, 'Display name must be less than 50 characters')
  .refine(
    (name) => !containsBlockedContent(name).blocked,
    {
      message: 'This display name contains inappropriate content',
    }
  )
  .optional()
  .nullable();

/**
 * Validate bio
 */
export const bioSchema = z
  .string()
  .trim()
  .max(500, 'Bio must be less than 500 characters')
  .refine(
    (bio) => !containsBlockedContent(bio).blocked,
    {
      message: 'Your bio contains inappropriate content. Please revise.',
    }
  )
  .optional()
  .nullable();
