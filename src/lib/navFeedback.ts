// Navigation feedback utilities - haptic and sound effects

// Haptic feedback for mobile devices
export const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (!('vibrate' in navigator)) return;
  
  const patterns: Record<string, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: [30, 10, 30],
  };
  
  try {
    navigator.vibrate(patterns[style]);
  } catch {
    // Vibration not supported or permission denied
  }
};

// Audio context for sound effects
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
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
};

// Play a subtle click/pop sound
export const playNavSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  try {
    // Create oscillator for a soft "pop" sound
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Soft click sound - quick frequency sweep
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);
    
    // Quick fade in/out for a pop effect
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.08);
  } catch {
    // Sound generation failed
  }
};

// Combined feedback for nav actions
export const triggerNavFeedback = () => {
  triggerHaptic('light');
  playNavSound();
};
