import { createContext, useContext, ReactNode } from 'react';
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
import LocalErrorBoundary from '@/components/error/LocalErrorBoundary';

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

/** Gesture/time detectors + celebration overlays — crash here just turns eggs off. */
function EasterEggEffects({
  unlockEgg,
  triggerRainbow,
  rainbowMode,
  confetti,
}: {
  unlockEgg: (id: string) => boolean;
  triggerRainbow: () => void;
  rainbowMode: boolean;
  confetti: boolean;
}) {
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
    <>
      {rainbowMode && <RainbowOverlay />}
      {confetti && <Confetti />}
    </>
  );
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
      <LocalErrorBoundary label="EasterEggEffects">
        <EasterEggEffects
          unlockEgg={unlockEgg}
          triggerRainbow={triggerRainbow}
          rainbowMode={rainbowMode}
          confetti={confetti}
        />
      </LocalErrorBoundary>
    </EasterEggContext.Provider>
  );
}
