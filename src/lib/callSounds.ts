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

// Play iconic melody note
function playMelodyNote(ctx: AudioContext, freq: number, startTime: number, duration: number, volume: number = 0.18): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.frequency.setValueAtTime(freq, startTime);
  osc.type = 'sine';
  
  // Smooth envelope
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.setValueAtTime(volume, startTime + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Play iconic ringtone melody (like iPhone/Samsung signature sound)
function playRingMelody(ctx: AudioContext, time: number): void {
  // Iconic ascending triad pattern - memorable and pleasant
  // E5 -> G5 -> B5 -> E6 (major triad going up)
  const notes = [
    { freq: 659.25, delay: 0, duration: 0.12 },     // E5
    { freq: 783.99, delay: 0.13, duration: 0.12 },  // G5  
    { freq: 987.77, delay: 0.26, duration: 0.12 },  // B5
    { freq: 1318.51, delay: 0.39, duration: 0.25 }, // E6 (held longer)
  ];
  
  notes.forEach(note => {
    playMelodyNote(ctx, note.freq, time + note.delay, note.duration);
  });
  
  // Add subtle harmony layer for richness
  const harmonyNotes = [
    { freq: 329.63, delay: 0, duration: 0.12 },     // E4 (octave below)
    { freq: 392.00, delay: 0.13, duration: 0.12 },  // G4
    { freq: 493.88, delay: 0.26, duration: 0.12 },  // B4
    { freq: 659.25, delay: 0.39, duration: 0.25 },  // E5
  ];
  
  harmonyNotes.forEach(note => {
    playMelodyNote(ctx, note.freq, time + note.delay, note.duration, 0.08);
  });
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
  
  // Play initial melody
  playRingMelody(ctx, ctx.currentTime);
  
  // Loop every 2.5 seconds (melody + pause)
  ringingInterval = window.setInterval(() => {
    const c = getAudioContext();
    if (c) {
      playRingMelody(c, c.currentTime);
    }
  }, 2500);
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
