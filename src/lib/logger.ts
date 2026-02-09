/**
 * Production-safe logger
 * 
 * In development: logs to console normally.
 * In production: routes logs to the in-memory debugLogger so they're
 * visible in the admin debug panel. Errors ALWAYS go to both console AND debugLogger.
 */
import { logEvent, type DebugLogType } from '@/lib/debugLogger';

const isDev = import.meta.env.DEV;

function toDebug(type: DebugLogType, tag: string | undefined, args: any[]) {
  const prefix = tag ? `[${tag}] ` : '';
  const message = prefix + args.map(a =>
    typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a)
  ).join(' ');
  logEvent(type, message.slice(0, 500));
}

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
    else toDebug('info', undefined, args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
    toDebug('warn', undefined, args);
  },
  error: (...args: any[]) => {
    console.error(...args); // Always log errors to console
    toDebug('error', undefined, args);
  },
  debug: (...args: any[]) => {
    if (isDev) console.debug(...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
    else toDebug('info', undefined, args);
  },
};

/**
 * Create a tagged logger for specific systems/components
 * Usage: const log = createLogger('CallOverlay');
 *        log.info('Something happened');
 */
export const createLogger = (tag: string) => ({
  log: (...args: any[]) => {
    if (isDev) console.log(`[${tag}]`, ...args);
    else toDebug('info', tag, args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(`[${tag}]`, ...args);
    toDebug('warn', tag, args);
  },
  error: (...args: any[]) => {
    console.error(`[${tag}]`, ...args); // Always log errors to console
    toDebug('error', tag, args);
  },
  debug: (...args: any[]) => {
    if (isDev) console.debug(`[${tag}]`, ...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info(`[${tag}]`, ...args);
    else toDebug('info', tag, args);
  },
});
