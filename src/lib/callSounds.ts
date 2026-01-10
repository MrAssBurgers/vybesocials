// Call Sound Effects System
// Provides ringing, connect, and end call sounds

type CallSoundType = 'ringing' | 'connect' | 'end' | 'ringback';

// Audio context singleton
let audioContext: AudioContext | null = null;
let ringingInterval: number | null = null;
let ringbackInterval: number | null = null;

// Get or create audio context
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  
  // Resume if suspended (autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  return audioContext;
}

// Play a single ring tone (for incoming call)
function playRingTone(ctx: AudioContext, time: number): void {
  const oscillator1 = ctx.createOscillator();
  const oscillator2 = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator1.connect(gainNode);
  oscillator2.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Classic phone ring - two tones
  oscillator1.frequency.setValueAtTime(440, time); // A4
  oscillator2.frequency.setValueAtTime(480, time); // Slightly higher
  oscillator1.type = 'sine';
  oscillator2.type = 'sine';
  
  // Ring pattern: 0.5s on, then fade
  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(0.15, time + 0.05);
  gainNode.gain.setValueAtTime(0.15, time + 0.4);
  gainNode.gain.linearRampToValueAtTime(0, time + 0.5);
  
  oscillator1.start(time);
  oscillator2.start(time);
  oscillator1.stop(time + 0.5);
  oscillator2.stop(time + 0.5);
}

// Play ringback tone (for outgoing call - what caller hears)
function playRingbackTone(ctx: AudioContext, time: number): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Standard ringback - single tone
  oscillator.frequency.setValueAtTime(440, time);
  oscillator.type = 'sine';
  
  // Pattern: 2s on, 4s off (we'll handle the off in the interval)
  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(0.08, time + 0.05);
  gainNode.gain.setValueAtTime(0.08, time + 1.8);
  gainNode.gain.linearRampToValueAtTime(0, time + 2);
  
  oscillator.start(time);
  oscillator.stop(time + 2);
}

// Play connect sound (call answered)
function playConnectSound(ctx: AudioContext): void {
  const time = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Pleasant ascending chime
  oscillator.frequency.setValueAtTime(523, time); // C5
  oscillator.frequency.linearRampToValueAtTime(659, time + 0.1); // E5
  oscillator.frequency.linearRampToValueAtTime(784, time + 0.2); // G5
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(0.12, time + 0.02);
  gainNode.gain.setValueAtTime(0.12, time + 0.15);
  gainNode.gain.linearRampToValueAtTime(0, time + 0.3);
  
  oscillator.start(time);
  oscillator.stop(time + 0.3);
}

// Play end call sound
function playEndSound(ctx: AudioContext): void {
  const time = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Descending tone - indicates end
  oscillator.frequency.setValueAtTime(440, time);
  oscillator.frequency.linearRampToValueAtTime(330, time + 0.15);
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(0.1, time + 0.02);
  gainNode.gain.setValueAtTime(0.1, time + 0.1);
  gainNode.gain.linearRampToValueAtTime(0, time + 0.2);
  
  oscillator.start(time);
  oscillator.stop(time + 0.2);
}

// Start ringing loop (for incoming calls)
export function startRinging(): void {
  stopAllCallSounds(); // Clear any existing
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  // Play initial ring
  playRingTone(ctx, ctx.currentTime);
  
  // Loop every 3 seconds (ring-ring pattern with pause)
  ringingInterval = window.setInterval(() => {
    const c = getAudioContext();
    if (c) {
      playRingTone(c, c.currentTime);
      // Second ring after 0.6s
      playRingTone(c, c.currentTime + 0.6);
    }
  }, 3000);
}

// Start ringback loop (for outgoing calls - what caller hears while waiting)
export function startRingback(): void {
  stopAllCallSounds();
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  // Play initial ringback
  playRingbackTone(ctx, ctx.currentTime);
  
  // Loop every 6 seconds (2s ring, 4s silence)
  ringbackInterval = window.setInterval(() => {
    const c = getAudioContext();
    if (c) {
      playRingbackTone(c, c.currentTime);
    }
  }, 6000);
}

// Play connect sound
export function playCallConnect(): void {
  stopAllCallSounds();
  
  const ctx = getAudioContext();
  if (ctx) {
    playConnectSound(ctx);
  }
}

// Play end call sound
export function playCallEnd(): void {
  stopAllCallSounds();
  
  const ctx = getAudioContext();
  if (ctx) {
    playEndSound(ctx);
  }
}

// Stop all call sounds
export function stopAllCallSounds(): void {
  if (ringingInterval) {
    clearInterval(ringingInterval);
    ringingInterval = null;
  }
  if (ringbackInterval) {
    clearInterval(ringbackInterval);
    ringbackInterval = null;
  }
}

// Convenience exports
export const callSounds = {
  startRinging,
  startRingback,
  connect: playCallConnect,
  end: playCallEnd,
  stopAll: stopAllCallSounds,
};
