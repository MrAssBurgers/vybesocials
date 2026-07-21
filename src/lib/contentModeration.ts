import { z } from 'zod';

/**
 * Lightweight client-side text filter for severe abuse / CSAM solicitation tokens.
 * Heavy media moderation remains Vybe Check (server).
 */
const BLOCKED_PATTERNS: RegExp[] = [
  /\b(kill\s*yourself|kys)\b/i,
  /\b(child\s*porn|cp\b|csam)\b/i,
  /\b(nazi\s*salute)\b/i,
];

/**
 * Check if text contains blocked content
 */
export function containsBlockedContent(text: string): { blocked: boolean; matches: string[] } {
  if (!text || !text.trim()) {
    return { blocked: false, matches: [] };
  }
  const matches: string[] = [];
  for (const pattern of BLOCKED_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[0]) matches.push(m[0]);
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
  let out = text;
  for (const pattern of BLOCKED_PATTERNS) {
    out = out.replace(pattern, '***');
  }
  return out;
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
    .superRefine((val, ctx) => {
      const { blocked, matches } = containsBlockedContent(val);
      if (blocked) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Content blocked (${matches.slice(0, 3).join(', ')})`,
        });
      }
    }),
});

/**
 * Validate username
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be less than 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

/**
 * Validate display name
 */
export const displayNameSchema = z
  .string()
  .trim()
  .max(50, 'Display name must be less than 50 characters')
  .optional()
  .nullable();

/**
 * Validate bio
 */
export const bioSchema = z
  .string()
  .trim()
  .max(500, 'Bio must be less than 500 characters')
  .optional()
  .nullable();
