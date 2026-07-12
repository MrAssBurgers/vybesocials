import type { Room } from 'livekit-client';

export type LiveKitClientModule = typeof import('livekit-client');

let livekitModule: LiveKitClientModule | null = null;
let loadPromise: Promise<LiveKitClientModule> | null = null;

/** Lazy-load LiveKit — only pulled when a persistent/Stay On Call session starts. */
export function loadLiveKit(): Promise<LiveKitClientModule> {
  if (livekitModule) return Promise.resolve(livekitModule);
  if (!loadPromise) {
    loadPromise = import('livekit-client').then((mod) => {
      livekitModule = mod;
      return mod;
    });
  }
  return loadPromise;
}

export type { Room };
