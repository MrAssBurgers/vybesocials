/**
 * Client-side rate limiter using in-memory sliding window.
 * Prevents spam clicks before requests even hit the server.
 */

const windows = new Map<string, number[]>();

/**
 * Check if an action is allowed under the rate limit.
 * @param key - Unique key for the action (e.g. 'create-post', 'send-dm')
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 * @returns true if allowed, false if rate limited
 */
export function clientRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const timestamps = windows.get(key) || [];
  
  // Remove expired timestamps
  const valid = timestamps.filter(t => now - t < windowMs);
  
  if (valid.length >= maxRequests) {
    windows.set(key, valid);
    return false;
  }
  
  valid.push(now);
  windows.set(key, valid);
  return true;
}

/**
 * Pre-configured rate limits for common actions
 */
export const RATE_LIMITS = {
  createPost: () => clientRateLimit('create-post', 5, 60_000),      // 5 posts/min
  sendMessage: () => clientRateLimit('send-dm', 30, 60_000),         // 30 DMs/min  
  aiChat: () => clientRateLimit('ai-chat', 10, 60_000),              // 10 AI msgs/min
  sendReaction: () => clientRateLimit('reaction', 30, 60_000),       // 30 reactions/min
  signup: () => clientRateLimit('signup', 3, 3600_000),              // 3 signups/hr
  passwordReset: () => clientRateLimit('password-reset', 3, 3600_000), // 3 resets/hr
} as const;
