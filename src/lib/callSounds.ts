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

// Play a clean, crisp notification note (no buzzing)
function playNotifNote(ctx: AudioContext, freq: number, startTime: number, duration: number, volume: number = 0.22): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.frequency.setValueAtTime(freq, startTime);
  osc.type = 'triangle'; // Clean, soft - no harsh buzzing
  
  // Quick punchy envelope
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// VYBE signature ring - quick, bouncy, iconic (better than Snap!)
function playVYBERing(ctx: AudioContext, time: number): void {
  // Catchy bounce pattern: pop-pop-DING!
  const melody = [
    { freq: 1046.50, delay: 0, duration: 0.07 },      // C6 - pop
    { freq: 1318.51, delay: 0.08, duration: 0.07 },   // E6 - pop  
    { freq: 1567.98, delay: 0.16, duration: 0.07 },   // G6 - pop
    { freq: 2093.00, delay: 0.27, duration: 0.4 },    // C7 - satisfying bell!
  ];
  
  melody.forEach(note => {
    playNotifNote(ctx, note.freq, time + note.delay, note.duration);
  });
  
  // Sparkle on the bell note
  playNotifNote(ctx, 2637.02, time + 0.29, 0.3, 0.1); // E7 shimmer
}

// Outgoing call sound - smooth pulsing tone (caller hears while waiting)
function playOutgoingPulse(ctx: AudioContext, time: number): void {
  // Gentle pulse: G5 -> B5 (pleasant waiting tone)
  const notes = [
    { freq: 783.99, delay: 0, duration: 0.3 },   // G5
    { freq: 987.77, delay: 0.35, duration: 0.3 }, // B5
  ];
  
  notes.forEach(note => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(note.freq, time + note.delay);
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0, time + note.delay);
    gain.gain.linearRampToValueAtTime(0.1, time + note.delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + note.delay + note.duration);
    
    osc.start(time + note.delay);
    osc.stop(time + note.delay + note.duration);
  });
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
  stopAllCallSounds();
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  // Play initial ring
  playVYBERing(ctx, ctx.currentTime);
  
  // Loop every 2 seconds
  ringingInterval = window.setInterval(() => {
    const c = getAudioContext();
    if (c) {
      playVYBERing(c, c.currentTime);
    }
  }, 2000);
}

// Start ringback loop (for outgoing calls - what caller hears while waiting)
export function startRingback(): void {
  stopAllCallSounds();
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  // Play initial pulse
  playOutgoingPulse(ctx, ctx.currentTime);
  
  // Loop every 1.5 seconds
  ringbackInterval = window.setInterval(() => {
    const c = getAudioContext();
    if (c) {
      playOutgoingPulse(c, c.currentTime);
    }
  }, 1500);
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
