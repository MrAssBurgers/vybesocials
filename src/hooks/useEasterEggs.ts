import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';

// Konami Code: ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

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
    try {
      const stored = localStorage.getItem('xd_easter_eggs');
      const values: unknown = stored ? JSON.parse(stored) : [];
      return new Set(Array.isArray(values) ? values.filter((id): id is string => EASTER_EGGS.some(egg => egg.id === id)) : []);
    } catch {
      // Corrupt localStorage must not crash the provider at mount.
      return new Set();
    }
  });
  // Effects and gestures can arrive before React commits the next render.
  // Claim synchronously; neither state updater replay nor an old callback can
  // award the same discovery twice.
  const unlockedRef = useRef(unlockedEggs);
  const [rainbowMode, setRainbowMode] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [confettiUntil, setConfettiUntil] = useState(0);
  const [rainbowUntil, setRainbowUntil] = useState(0);

  useEffect(() => {
    if (!confettiUntil) return;
    const timer = setTimeout(() => setConfetti(false), Math.max(0, confettiUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [confettiUntil]);
  useEffect(() => {
    if (!rainbowUntil) return;
    const timer = setTimeout(() => setRainbowMode(false), Math.max(0, rainbowUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [rainbowUntil]);

  // Sync from DB on mount
  useEffect(() => {
    let active = true;
    db.auth.getUser().then(({ data: { user } }) => {
      if (!active || !user?.id) return;
      return db
        .from('user_preferences' as any)
        .select('unlocked_easter_eggs')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          const dbEggs = (data as any)?.unlocked_easter_eggs;
          if (active && Array.isArray(dbEggs) && dbEggs.length > 0) {
            const known = dbEggs.filter((id): id is string => EASTER_EGGS.some(egg => egg.id === id));
            const merged = new Set([...unlockedRef.current, ...known]);
            unlockedRef.current = merged;
            setUnlockedEggs(merged);
            try { localStorage.setItem('xd_easter_eggs', JSON.stringify([...merged])); } catch { /* Device storage is optional. */ }
          }
        });
    }).catch(() => { /* Offline preferences do not block local discoveries. */ });
    return () => { active = false; };
  }, []);

  const saveUnlocked = useCallback((eggs: Set<string>) => {
    const arr = [...eggs];
    try { localStorage.setItem('xd_easter_eggs', JSON.stringify(arr)); } catch { /* Keep the in-memory discovery when storage is unavailable. */ }
    // Persist to DB (fire-and-forget)
    db.auth.getUser().then(({ data: { user } }) => {
      if (!user?.id) return;
      return db
        .from('user_preferences' as any)
        .upsert({
          user_id: user.id,
          unlocked_easter_eggs: [...unlockedRef.current],
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' })
        .then(() => {});
    }).catch(() => { /* Preference sync can retry on a later discovery. */ });
  }, []);

  const unlockEgg = useCallback((eggId: string) => {
    if (unlockedRef.current.has(eggId)) return false;
    
    const egg = EASTER_EGGS.find(e => e.id === eggId);
    if (!egg) return false;

    const next = new Set(unlockedRef.current);
    next.add(eggId);
    unlockedRef.current = next;
    setUnlockedEggs(next);
    saveUnlocked(next);

    // Show celebration
    setConfetti(true);
    setConfettiUntil(Date.now() + 3000);
    
    toast.success(`🎉 Easter Egg Unlocked: ${egg.name}!`, {
      description: egg.description,
      duration: 5000,
    });

    return true;
  }, [saveUnlocked]);

  const triggerRainbow = useCallback(() => {
    setRainbowMode(true);
    unlockEgg('rainbow');
    toast.success('🌈 Rainbow Mode Activated!', { duration: 3000 });
    setRainbowUntil(Date.now() + 10000);
  }, [unlockEgg]);

  const eggs = EASTER_EGGS.map(egg => ({
    ...egg,
    unlocked: unlockedEggs.has(egg.id),
    unlockedAt: (() => {
      try { return unlockedEggs.has(egg.id) ? localStorage.getItem(`xd_egg_${egg.id}_at`) || undefined : undefined; }
      catch { return undefined; }
    })(),
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
  const sequenceRef = useRef<string[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Clear previous timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      const next = [...sequenceRef.current, e.code].slice(-KONAMI_CODE.length);
      const matched = next.length === KONAMI_CODE.length && next.every((key, i) => key === KONAMI_CODE[i]);
      sequenceRef.current = matched ? [] : next;
      setInputSequence(sequenceRef.current);
      if (matched) onActivate();

      // Reset after 2 seconds of no input
      timeoutRef.current = setTimeout(() => { sequenceRef.current = []; setInputSequence([]); }, 2000);
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

    const requiresUserGesture = typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function';

    if (!requiresUserGesture) {
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
