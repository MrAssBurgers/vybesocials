/**
 * Daily.co Singleton Manager
 * 
 * CRITICAL: Daily.co only allows ONE iframe instance per page.
 * This module ensures we never create duplicate instances.
 */

import DailyIframe, { DailyCall as DailyCallObject } from '@daily-co/daily-js';

let dailyInstance: DailyCallObject | null = null;
let isJoining = false;
let currentRoomUrl: string | null = null;

export function getDailyInstance(): DailyCallObject | null {
  return dailyInstance;
}

export function hasDailyInstance(): boolean {
  return dailyInstance !== null;
}

export function isCurrentlyJoining(): boolean {
  return isJoining;
}

export function setJoiningState(joining: boolean): void {
  isJoining = joining;
}

export function getCurrentRoomUrl(): string | null {
  return currentRoomUrl;
}

export function createDailyInstance(
  container: HTMLElement,
  options?: {
    iframeStyle?: Partial<CSSStyleDeclaration>;
    showLeaveButton?: boolean;
    showFullscreenButton?: boolean;
  }
): DailyCallObject {
  // CRITICAL: If instance exists, destroy it first
  if (dailyInstance) {
    console.warn('[dailySingleton] Instance already exists, destroying old one first');
    destroyDailyInstance();
  }

  console.log('[dailySingleton] Creating new Daily instance');
  dailyInstance = DailyIframe.createFrame(container, options);
  return dailyInstance;
}

export async function joinRoom(roomUrl: string): Promise<void> {
  if (!dailyInstance) {
    throw new Error('No Daily instance exists. Create one first.');
  }

  if (isJoining) {
    console.warn('[dailySingleton] Already joining, ignoring duplicate join request');
    return;
  }

  if (currentRoomUrl === roomUrl) {
    console.warn('[dailySingleton] Already in this room:', roomUrl);
    return;
  }

  isJoining = true;
  currentRoomUrl = roomUrl;

  try {
    console.log('[dailySingleton] Joining room:', roomUrl);
    await dailyInstance.join({ url: roomUrl });
    console.log('[dailySingleton] Successfully joined room');
  } catch (error) {
    console.error('[dailySingleton] Failed to join room:', error);
    currentRoomUrl = null;
    throw error;
  } finally {
    isJoining = false;
  }
}

export async function leaveRoom(): Promise<void> {
  if (!dailyInstance) {
    console.log('[dailySingleton] No instance to leave');
    return;
  }

  try {
    console.log('[dailySingleton] Leaving room');
    await dailyInstance.leave();
  } catch (error) {
    console.error('[dailySingleton] Error leaving room:', error);
  }
  
  currentRoomUrl = null;
}

export function destroyDailyInstance(): void {
  if (!dailyInstance) {
    console.log('[dailySingleton] No instance to destroy');
    return;
  }

  try {
    console.log('[dailySingleton] Destroying Daily instance');
    // Try to leave first if we're in a room
    if (currentRoomUrl) {
      dailyInstance.leave().catch(() => {});
    }
    dailyInstance.destroy();
  } catch (error) {
    console.error('[dailySingleton] Error destroying instance:', error);
  }

  dailyInstance = null;
  currentRoomUrl = null;
  isJoining = false;
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    destroyDailyInstance();
  });
}
