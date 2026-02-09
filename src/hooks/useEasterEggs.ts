import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

// Konami Code: ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

// Secret codes
const SECRET_CODES: Record<string, { name: string; action: () => void }> = {};

export interface EasterEgg {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
  icon: string;
}

const EASTER_EGGS: EasterEgg[] = [
  { id: 'konami', name: 'Konami Master', description: 'Enter the legendary Konami code', unlocked: false, icon: '🎮' },
  { id: 'rainbow', name: 'Rainbow Mode', description: 'Activate rainbow theme', unlocked: false, icon: '🌈' },
  { id: 'shake', name: 'Shake It Off', description: 'Shake your device/screen', unlocked: false, icon: '📱' },
  { id: 'triple_tap', name: 'Triple Threat', description: 'Triple tap the logo', unlocked: false, icon: '👆' },
  { id: 'dark_mode_5x', name: 'Indecisive', description: 'Toggle dark mode 5 times quickly', unlocked: false, icon: '🌓' },
  { id: 'scroll_top', name: 'Speed Demon', description: 'Scroll to top super fast', unlocked: false, icon: '⚡' },
  { id: 'type_xd', name: 'XD Enthusiast', description: 'Type "xd" anywhere', unlocked: false, icon: '😆' },
  { id: 'rotate_phone', name: 'Spinner', description: 'Rotate your device 360°', unlocked: false, icon: '🔄' },
  { id: 'midnight', name: 'Night Owl', description: 'Use the app at midnight', unlocked: false, icon: '🦉' },
  { id: 'first_story', name: 'Story Teller', description: 'Post your first story', unlocked: false, icon: '📖' },
  { id: 'streak_7', name: 'Week Warrior', description: 'Maintain a 7-day streak', unlocked: false, icon: '🔥' },
  { id: 'streak_30', name: 'Monthly Master', description: 'Maintain a 30-day streak', unlocked: false, icon: '💎' },
  { id: '100_messages', name: 'Chatterbox', description: 'Send 100 messages', unlocked: false, icon: '💬' },
  { id: '10_friends', name: 'Social Butterfly', description: 'Make 10 friends', unlocked: false, icon: '🦋' },
  { id: 'secret_double_tap', name: 'Double Trouble', description: 'Double tap a secret area', unlocked: false, icon: '✨' },
  { id: 'long_press', name: 'Patient One', description: 'Long press for 10 seconds', unlocked: false, icon: '⏰' },
  { id: 'swipe_pattern', name: 'Pattern Master', description: 'Swipe in a secret pattern', unlocked: false, icon: '🎯' },
  { id: 'emoji_spam', name: 'Emoji Lover', description: 'Use 50 emojis in one message', unlocked: false, icon: '😍' },
  { id: 'night_mode', name: 'Vampire', description: 'Use dark mode for 7 days straight', unlocked: false, icon: '🧛' },
  { id: 'profile_complete', name: 'Perfectionist', description: 'Complete 100% of your profile', unlocked: false, icon: '✅' },
  { id: 'first_like', name: 'Appreciation', description: 'Like your first post', unlocked: false, icon: '❤️' },
  { id: 'explorer', name: 'Explorer', description: 'Visit all pages in the app', unlocked: false, icon: '🗺️' },
  { id: 'speed_typer', name: 'Speed Demon', description: 'Type 100 WPM', unlocked: false, icon: '⌨️' },
  { id: 'early_bird', name: 'Early Bird', description: 'Use the app at 5 AM', unlocked: false, icon: '🐦' },
  { id: 'zen_mode', name: 'Zen Master', description: 'Enable reduced motion', unlocked: false, icon: '🧘' },
];

export function useEasterEggs() {
  const [unlockedEggs, setUnlockedEggs] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('xd_easter_eggs');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const [rainbowMode, setRainbowMode] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const saveUnlocked = useCallback((eggs: Set<string>) => {
    localStorage.setItem('xd_easter_eggs', JSON.stringify([...eggs]));
  }, []);

  const unlockEgg = useCallback((eggId: string) => {
    if (unlockedEggs.has(eggId)) return false;
    
    const egg = EASTER_EGGS.find(e => e.id === eggId);
    if (!egg) return false;

    setUnlockedEggs(prev => {
      const next = new Set(prev);
      next.add(eggId);
      saveUnlocked(next);
      return next;
    });

    // Show celebration
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3000);
    
    toast.success(`🎉 Easter Egg Unlocked: ${egg.name}!`, {
      description: egg.description,
      duration: 5000,
    });

    return true;
  }, [unlockedEggs, saveUnlocked]);

  const triggerRainbow = useCallback(() => {
    setRainbowMode(true);
    unlockEgg('rainbow');
    toast.success('🌈 Rainbow Mode Activated!', { duration: 3000 });
    setTimeout(() => setRainbowMode(false), 10000);
  }, [unlockEgg]);

  const eggs = EASTER_EGGS.map(egg => ({
    ...egg,
    unlocked: unlockedEggs.has(egg.id),
    unlockedAt: unlockedEggs.has(egg.id) ? localStorage.getItem(`xd_egg_${egg.id}_at`) : undefined,
  }));

  return {
    eggs,
    unlockedCount: unlockedEggs.size,
    totalCount: EASTER_EGGS.length,
    unlockEgg,
    isUnlocked: (id: string) => unlockedEggs.has(id),
    rainbowMode,
    triggerRainbow,
    confetti,
  };
}

export function useKonamiCode(onActivate: () => void) {
  const [inputSequence, setInputSequence] = useState<string[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Clear previous timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      setInputSequence(prev => {
        const next = [...prev, e.code].slice(-KONAMI_CODE.length);
        
        // Check if matches Konami code
        if (next.length === KONAMI_CODE.length && 
            next.every((key, i) => key === KONAMI_CODE[i])) {
          onActivate();
          return [];
        }
        
        return next;
      });

      // Reset after 2 seconds of no input
      timeoutRef.current = setTimeout(() => setInputSequence([]), 2000);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onActivate]);

  return inputSequence.length;
}

export function useShakeDetection(onShake: () => void, threshold = 15) {
  const lastAcceleration = useRef({ x: 0, y: 0, z: 0 });
  const shakeCount = useRef(0);
  const lastShakeTime = useRef(0);

  useEffect(() => {
    const handleMotion = (e: DeviceMotionEvent) => {
      const acceleration = e.accelerationIncludingGravity;
      if (!acceleration) return;

      const { x, y, z } = acceleration;
      const deltaX = Math.abs((x || 0) - lastAcceleration.current.x);
      const deltaY = Math.abs((y || 0) - lastAcceleration.current.y);
      const deltaZ = Math.abs((z || 0) - lastAcceleration.current.z);

      if (deltaX + deltaY + deltaZ > threshold) {
        const now = Date.now();
        if (now - lastShakeTime.current > 100) {
          shakeCount.current++;
          lastShakeTime.current = now;

          if (shakeCount.current >= 3) {
            onShake();
            shakeCount.current = 0;
          }
        }
      }

      lastAcceleration.current = { x: x || 0, y: y || 0, z: z || 0 };
    };

    // Try to get permission on iOS 13+
    if (typeof DeviceMotionEvent !== 'undefined' && 
        typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('devicemotion', handleMotion);
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [onShake, threshold]);
}

export function useTripleTap(onTripleTap: () => void) {
  const tapCount = useRef(0);
  const lastTapTime = useRef(0);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      tapCount.current++;
      if (tapCount.current >= 3) {
        onTripleTap();
        tapCount.current = 0;
      }
    } else {
      tapCount.current = 1;
    }
    lastTapTime.current = now;
  }, [onTripleTap]);

  return handleTap;
}

export function useLongPress(onLongPress: () => void, duration = 10000) {
  const timerRef = useRef<NodeJS.Timeout>();
  const [progress, setProgress] = useState(0);

  const start = useCallback(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min((elapsed / duration) * 100, 100));
      
      if (elapsed >= duration) {
        clearInterval(interval);
        onLongPress();
        setProgress(0);
      }
    }, 100);
    
    timerRef.current = interval as any;
  }, [duration, onLongPress]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      setProgress(0);
    }
  }, []);

  return { start, cancel, progress };
}

export function useSecretTyping(onSecret: (code: string) => void) {
  const buffer = useRef('');
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      buffer.current += e.key.toLowerCase();
      
      // Check for secret codes
      if (buffer.current.includes('xd')) {
        onSecret('xd');
        buffer.current = '';
      }
      if (buffer.current.includes('rainbow')) {
        onSecret('rainbow');
        buffer.current = '';
      }
      if (buffer.current.includes('party')) {
        onSecret('party');
        buffer.current = '';
      }

      // Clear buffer after 2 seconds
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => { buffer.current = ''; }, 2000);
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onSecret]);
}

export function useMidnightCheck(onMidnight: () => void) {
  useEffect(() => {
    // Single check on mount - no interval needed for easter eggs
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() < 5) {
      onMidnight();
    }
  }, [onMidnight]);
}

export function useEarlyBirdCheck(onEarlyBird: () => void) {
  useEffect(() => {
    const checkEarlyBird = () => {
      const now = new Date();
      if (now.getHours() === 5) {
        onEarlyBird();
      }
    };

    checkEarlyBird();
  }, [onEarlyBird]);
}
