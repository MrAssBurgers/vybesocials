import { createContext, useContext, useEffect, ReactNode } from 'react';
import { 
  useEasterEggs, 
  useKonamiCode, 
  useShakeDetection, 
  useSecretTyping,
  useMidnightCheck,
  useEarlyBirdCheck,
  EasterEgg 
} from '@/hooks/useEasterEggs';
import { Confetti } from './Confetti';
import { RainbowOverlay } from './RainbowOverlay';

interface EasterEggContextType {
  eggs: EasterEgg[];
  unlockedCount: number;
  totalCount: number;
  unlockEgg: (id: string) => boolean;
  isUnlocked: (id: string) => boolean;
  rainbowMode: boolean;
  triggerRainbow: () => void;
}

const EasterEggContext = createContext<EasterEggContextType | null>(null);

export function useEasterEggContext() {
  const ctx = useContext(EasterEggContext);
  if (!ctx) throw new Error('useEasterEggContext must be used within EasterEggProvider');
  return ctx;
}

export function EasterEggProvider({ children }: { children: ReactNode }) {
  const {
    eggs,
    unlockedCount,
    totalCount,
    unlockEgg,
    isUnlocked,
    rainbowMode,
    triggerRainbow,
    confetti,
  } = useEasterEggs();

  // Konami code
  useKonamiCode(() => {
    unlockEgg('konami');
    triggerRainbow();
  });

  // Shake detection
  useShakeDetection(() => {
    unlockEgg('shake');
  });

  // Secret typing
  useSecretTyping((code) => {
    if (code === 'xd') {
      unlockEgg('type_xd');
    }
    if (code === 'rainbow') {
      triggerRainbow();
    }
    if (code === 'party') {
      triggerRainbow();
    }
  });

  // Midnight check
  useMidnightCheck(() => {
    unlockEgg('midnight');
  });

  // Early bird check
  useEarlyBirdCheck(() => {
    unlockEgg('early_bird');
  });

  return (
    <EasterEggContext.Provider value={{
      eggs,
      unlockedCount,
      totalCount,
      unlockEgg,
      isUnlocked,
      rainbowMode,
      triggerRainbow,
    }}>
      {children}
      {rainbowMode && <RainbowOverlay />}
      {confetti && <Confetti />}
    </EasterEggContext.Provider>
  );
}
