// Call & Notification Sound Effects System
// Premium, glitch-free ringing, connect, end call, and message notification sounds
// Designed for smooth, satisfying audio like FaceTime/iMessage

type CallSoundType = 'ringing' | 'connect' | 'end' | 'ringback' | 'message';

// Audio context singleton
let audioContext: AudioContext | null = null;
let ringingInterval: number | null = null;
let ringbackInterval: number | null = null;
const lastMessageSoundTime = 0;

// Active oscillators for clean cleanup
const activeNodes: Set<AudioScheduledSourceNode> = new Set();

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

// Create a smooth, clean tone with proper envelope (no clicks/glitches)
function createSmoothTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.35,
  type: OscillatorType = 'sine'
): { oscillator: OscillatorNode; gain: GainNode } {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  
  // Ensure startTime is never negative (fixes AudioParam error)
  const safeStartTime = Math.max(0, startTime, ctx.currentTime);
  const safeDuration = Math.max(0.1, duration); // Minimum duration
  
  // Add slight low-pass filter for warmth
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, safeStartTime);
  filter.Q.setValueAtTime(0.5, safeStartTime);
  
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  oscillator.frequency.setValueAtTime(frequency, safeStartTime);
  oscillator.type = type;
  
  // Smooth envelope - prevents clicks (ensure all times are positive)
  const attackEnd = safeStartTime + 0.015;
  const releaseStart = Math.max(attackEnd + 0.01, safeStartTime + safeDuration - 0.05);
  const releaseEnd = safeStartTime + safeDuration;
  
  gain.gain.setValueAtTime(0, safeStartTime);
  gain.gain.linearRampToValueAtTime(volume, attackEnd); // Soft attack
  gain.gain.setValueAtTime(volume, releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd); // Smooth release
  
  oscillator.start(safeStartTime);
  oscillator.stop(releaseEnd);
  
  // Track for cleanup
  activeNodes.add(oscillator);
  oscillator.onended = () => activeNodes.delete(oscillator);
  
  return { oscillator, gain };
}

// Premium bell tone with harmonics (like iOS)
function playBellTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.30
): void {
  // Fundamental
  createSmoothTone(ctx, frequency, startTime, duration, volume, 'sine');
  
  // Add subtle harmonics for richness
  createSmoothTone(ctx, frequency * 2, startTime, duration * 0.7, volume * 0.15, 'sine');
  createSmoothTone(ctx, frequency * 3, startTime, duration * 0.5, volume * 0.08, 'sine');
}

// Premium incoming call ringtone - smooth, satisfying, Apple-like
function playPremiumRing(ctx: AudioContext, time: number): void {
  // Elegant ascending arpeggio with bell tones
  const notes = [
    { freq: 880.00, delay: 0, duration: 0.18 },      // A5
    { freq: 1108.73, delay: 0.12, duration: 0.18 },  // C#6
    { freq: 1318.51, delay: 0.24, duration: 0.18 },  // E6
    { freq: 1760.00, delay: 0.38, duration: 0.45 },  // A6 - hold
  ];
  
  notes.forEach((note, i) => {
    const vol = i === notes.length - 1 ? 0.35 : 0.28; // Last note louder
    playBellTone(ctx, note.freq, time + note.delay, note.duration, vol);
  });
  
  // Add subtle shimmer on final note
  setTimeout(() => {
    const c = getAudioContext();
    if (c) {
      createSmoothTone(c, 2217.46, c.currentTime, 0.25, 0.12, 'sine'); // C#7 shimmer
    }
  }, 420);
}

// Smooth message notification - quick satisfying "ding"
function playMessageNotif(ctx: AudioContext, time: number): void {
  // Two-note chime: soft pop + pleasant ding
  playBellTone(ctx, 1318.51, time, 0.08, 0.28);        // E6 - soft attack
  playBellTone(ctx, 1760.00, time + 0.06, 0.20, 0.32); // A6 - satisfying ring
}

// Outgoing ringback - gentle, non-intrusive pulse
function playRingbackPulse(ctx: AudioContext, time: number): void {
  // Classic phone-like double pulse, but softer
  const pulses = [
    { freq: 440, delay: 0, duration: 0.35 },    // A4
    { freq: 440, delay: 0.45, duration: 0.35 }, // A4
  ];
  
  pulses.forEach(pulse => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time + pulse.delay);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(pulse.freq, time + pulse.delay);
    osc.type = 'sine';
    
    // Very smooth envelope
    const t = time + pulse.delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.03);
    gain.gain.setValueAtTime(0.25, t + pulse.duration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + pulse.duration);
    
    osc.start(t);
    osc.stop(t + pulse.duration);
    
    activeNodes.add(osc);
    osc.onended = () => activeNodes.delete(osc);
  });
}

// Call connected sound - satisfying ascending chime
function playConnectSound(ctx: AudioContext): void {
  const time = ctx.currentTime;
  
  // Happy ascending chord
  const notes = [
    { freq: 523.25, delay: 0, duration: 0.12 },    // C5
    { freq: 659.25, delay: 0.08, duration: 0.12 }, // E5
    { freq: 783.99, delay: 0.16, duration: 0.25 }, // G5 - hold
  ];
  
  notes.forEach((note, i) => {
    playBellTone(ctx, note.freq, time + note.delay, note.duration, i === 2 ? 0.30 : 0.22);
  });
}

// Call ended sound - soft descending tone
function playEndSound(ctx: AudioContext): void {
  const time = ctx.currentTime;
  
  // Gentle descending two-note
  createSmoothTone(ctx, 523.25, time, 0.12, 0.22, 'sine');       // C5
  createSmoothTone(ctx, 392.00, time + 0.10, 0.18, 0.18, 'sine'); // G4
}

// Stop all active sounds immediately (no glitches)
function stopAllSoundsNow(): void {
  activeNodes.forEach(node => {
    try {
      node.stop();
    } catch {
      // Already stopped
    }
  });
  activeNodes.clear();
}

// Start ringing loop (for incoming calls)
export function startRinging(): void {
  void import('@/lib/deviceSilentMode').then(({ shouldPlayNotificationSound }) =>
    shouldPlayNotificationSound('calls').then((ok) => {
      if (!ok) return;
      stopAllCallSounds();
      const ctx = getAudioContext();
      if (!ctx) return;
      playPremiumRing(ctx, ctx.currentTime);
      ringingInterval = window.setInterval(() => {
        const c = getAudioContext();
        if (c) playPremiumRing(c, c.currentTime);
      }, 2500);
    }),
  );
}

// Start ringback loop (for outgoing calls)
export function startRingback(): void {
  stopAllCallSounds();
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  // Play initial pulse
  playRingbackPulse(ctx, ctx.currentTime);
  
  // Loop every 3 seconds (standard ringback timing)
  ringbackInterval = window.setInterval(() => {
    const c = getAudioContext();
    if (c) {
      playRingbackPulse(c, c.currentTime);
    }
  }, 3000);
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

// Play message notification sound - now uses premium sounds
export function playMessageSound(): void {
  // Import dynamically to avoid circular dependency
  import('./premiumSounds').then(({ premiumSounds }) => {
    premiumSounds.messageReceive();
  });
}

// Stop all call sounds cleanly
export function stopAllCallSounds(): void {
  if (ringingInterval) {
    clearInterval(ringingInterval);
    ringingInterval = null;
  }
  if (ringbackInterval) {
    clearInterval(ringbackInterval);
    ringbackInterval = null;
  }
  stopAllSoundsNow();
}

// Convenience exports
export const callSounds = {
  startRinging,
  startRingback,
  connect: playCallConnect,
  end: playCallEnd,
  stopAll: stopAllCallSounds,
  message: playMessageSound,
};
