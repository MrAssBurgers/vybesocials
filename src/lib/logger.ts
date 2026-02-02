/**
 * Production-safe logger
 * 
 * Only logs in development mode to prevent console.log pollution in production builds.
 * Errors are ALWAYS logged regardless of environment for debugging critical issues.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => isDev && console.log(...args),
  warn: (...args: any[]) => isDev && console.warn(...args),
  error: (...args: any[]) => console.error(...args), // Always log errors
  debug: (...args: any[]) => isDev && console.debug(...args),
  info: (...args: any[]) => isDev && console.info(...args),
};

/**
 * Create a tagged logger for specific systems/components
 * Usage: const log = createLogger('CallOverlay');
 *        log.info('Something happened');
 */
export const createLogger = (tag: string) => ({
  log: (...args: any[]) => isDev && console.log(`[${tag}]`, ...args),
  warn: (...args: any[]) => isDev && console.warn(`[${tag}]`, ...args),
  error: (...args: any[]) => console.error(`[${tag}]`, ...args), // Always log errors
  debug: (...args: any[]) => isDev && console.debug(`[${tag}]`, ...args),
  info: (...args: any[]) => isDev && console.info(`[${tag}]`, ...args),
});
