/**
 * Daily.co Singleton Manager
 *
 * CRITICAL: Daily.co only allows ONE iframe instance per page.
 *
 * This module enforces a single, permanent Daily iframe + call object.
 * - The iframe/call object is created ONCE (when the app loads)
 * - Calls use join({ url }) / leave()
 * - We do NOT recreate the iframe per call (prevents Duplicate DailyIframe)
 */

import DailyIframe, {
  DailyCall as DailyCallObject,
  DailyFactoryOptions,
} from '@daily-co/daily-js';

let dailyInstance: DailyCallObject | null = null;
let isJoining = false;
let currentRoomUrl: string | null = null;

export function ensureDailyFrame(parentElement: HTMLElement, options?: DailyFactoryOptions): DailyCallObject {
  if (dailyInstance) return dailyInstance;

  console.log('[dailySingleton] Mounting permanent Daily iframe');
  dailyInstance = DailyIframe.createFrame(parentElement, {
    ...options,
  });

  return dailyInstance;
}

export function getDailyInstance(): DailyCallObject | null {
  return dailyInstance;
}

export function getCurrentRoomUrl(): string | null {
  return currentRoomUrl;
}

export function isCurrentlyJoining(): boolean {
  return isJoining;
}

export async function joinRoom(roomUrl: string, token?: string): Promise<void> {
  if (!dailyInstance) throw new Error('Daily is not initialized');

  if (isJoining) {
    console.log('[dailySingleton] Already joining, skipping');
    return;
  }
  if (currentRoomUrl === roomUrl) {
    console.log('[dailySingleton] Already in room:', roomUrl);
    return;
  }

  isJoining = true;
  currentRoomUrl = roomUrl;

  try {
    console.log('[dailySingleton] Joining room:', roomUrl, 'with token:', !!token);
    
    const joinOptions: { url: string; token?: string; showLocalVideo?: boolean; showParticipantsBar?: boolean } = { 
      url: roomUrl,
      showLocalVideo: true,
      showParticipantsBar: false,
    };
    if (token) {
      joinOptions.token = token;
    }
    
    // Add timeout for join operation
    const joinPromise = dailyInstance.join(joinOptions);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Join operation timed out')), 20000)
    );
    
    await Promise.race([joinPromise, timeoutPromise]);
    console.log('[dailySingleton] Successfully joined room');
  } catch (e: any) {
    console.error('[dailySingleton] Join failed:', e);
    currentRoomUrl = null;
    throw e;
  } finally {
    isJoining = false;
  }
}

export async function leaveRoom(): Promise<void> {
  if (!dailyInstance) return;

  try {
    await dailyInstance.leave();
  } catch {
    // ignore
  } finally {
    currentRoomUrl = null;
    isJoining = false;
  }
}

/**
 * Hard reset (used only for page unload / emergency recovery).
 * NOTE: This will remove the iframe from the DOM.
 */
export async function destroyDailyInstance(): Promise<void> {
  if (!dailyInstance) return;

  try {
    await dailyInstance.destroy();
  } catch {
    // ignore
  } finally {
    dailyInstance = null;
    currentRoomUrl = null;
    isJoining = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // fire-and-forget
    void destroyDailyInstance();
  });
}

