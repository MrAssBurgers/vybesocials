// Legacy call consumers share the same mute, mix and cancellation path as incoming calls.
import { premiumSounds } from './premiumSounds';

export const startRinging = premiumSounds.startRinging;
export const startRingback = premiumSounds.startRingback;
export const playCallConnect = premiumSounds.callConnect;
export const playCallEnd = premiumSounds.callEnd;
export const playMessageSound = premiumSounds.messageReceive;
export const stopAllCallSounds = premiumSounds.stopAllCallSounds;

export const callSounds = {
  startRinging, startRingback,
  connect: playCallConnect,
  end: playCallEnd,
  stopAll: stopAllCallSounds,
  message: playMessageSound,
};
