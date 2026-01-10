import { z } from 'zod';

// Uncensored mode - no content filtering
const BLOCKED_PATTERNS: RegExp[] = [];

/**
 * Check if text contains blocked content - disabled for uncensored mode
 */
export function containsBlockedContent(text: string): { blocked: boolean; matches: string[] } {
  return {
    blocked: false,
    matches: [],
  };
}

/**
 * Filter/censor blocked content from text - disabled for uncensored mode
 */
export function filterBlockedContent(text: string): string {
  return text;
}

/**
 * Validate user-generated content - no content restrictions
 */
export const contentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Content cannot be empty')
    .max(5000, 'Content is too long'),
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
