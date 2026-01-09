import { z } from 'zod';

// Only block death threats and violent threats - allow free speech otherwise
const BLOCKED_PATTERNS = [
  // Death threats
  /\b(i('ll|m\s+going\s+to|m\s+gonna|'m\s+going\s+to|'m\s+gonna)\s+)?kill\s+(you|u|him|her|them)\b/gi,
  /\bi\s+will\s+kill\s+(you|u|him|her|them)\b/gi,
  /\bkill\s+yourself\b/gi,
  /\bkys\b/gi,
  /\bgo\s+die\b/gi,
  /\bhope\s+(you|u)\s+die\b/gi,
  /\bwish\s+(you|u)\s+(were\s+)?dead\b/gi,
  /\b(you|u)\s+should\s+die\b/gi,
  /\bi('ll|'m\s+going\s+to|'m\s+gonna)\s+murder\s+(you|u)\b/gi,
  /\bdeath\s+threat/gi,
  /\bi('ll|m\s+going\s+to)\s+end\s+(your|ur)\s+life\b/gi,
];

// No obfuscation normalization needed for threat detection

/**
 * Check if text contains death threats or violent content
 */
export function containsBlockedContent(text: string): { blocked: boolean; matches: string[] } {
  const matches: string[] = [];
  
  for (const pattern of BLOCKED_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matches.push(match[0]);
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
  
  for (const pattern of BLOCKED_PATTERNS) {
    filtered = filtered.replace(pattern, '[content removed]');
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
        message: 'Your content contains threats or violent language. Please revise.',
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
      message: 'This username contains threatening content',
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
      message: 'This display name contains threatening content',
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
      message: 'Your bio contains threatening content. Please revise.',
    }
  )
  .optional()
  .nullable();
