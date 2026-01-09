// Sound Design System
// Provides subtle, optional UI sounds

type SoundType = 'tap' | 'pop' | 'success' | 'send' | 'receive' | 'error' | 'navigate';

// Audio context singleton
let audioContext: AudioContext | null = null;

// Check if sounds are enabled (stored in localStorage)
function isSoundsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('vybe-sounds-enabled');
  return stored === 'true'; // Default to false for sounds
}

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

// Sound configurations
const SOUND_CONFIG: Record<SoundType, { frequency: number; duration: number; volume: number; type: OscillatorType }> = {
  tap: { frequency: 800, duration: 0.05, volume: 0.05, type: 'sine' },
  pop: { frequency: 600, duration: 0.08, volume: 0.08, type: 'sine' },
  success: { frequency: 880, duration: 0.12, volume: 0.06, type: 'sine' },
  send: { frequency: 500, duration: 0.1, volume: 0.06, type: 'triangle' },
  receive: { frequency: 700, duration: 0.15, volume: 0.05, type: 'sine' },
  error: { frequency: 200, duration: 0.2, volume: 0.08, type: 'square' },
  navigate: { frequency: 400, duration: 0.06, volume: 0.04, type: 'sine' },
};

// Play a sound
function playSound(type: SoundType): void {
  if (!isSoundsEnabled()) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const config = SOUND_CONFIG[type];
  
  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = config.type;
    oscillator.frequency.setValueAtTime(config.frequency, ctx.currentTime);
    
    // Frequency sweep for more pleasing sound
    if (type === 'pop' || type === 'tap') {
      oscillator.frequency.exponentialRampToValueAtTime(
        config.frequency * 0.5, 
        ctx.currentTime + config.duration
      );
    }
    
    // Envelope
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(config.volume, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + config.duration);
  } catch {
    // Sound generation failed
  }
}

// Specific sound triggers
export const sounds = {
  tap: () => playSound('tap'),
  pop: () => playSound('pop'),
  success: () => playSound('success'),
  send: () => playSound('send'),
  receive: () => playSound('receive'),
  error: () => playSound('error'),
  navigate: () => playSound('navigate'),
};

// Settings management
export function setSoundsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('vybe-sounds-enabled', String(enabled));
}

export function getSoundsEnabled(): boolean {
  return isSoundsEnabled();
}
