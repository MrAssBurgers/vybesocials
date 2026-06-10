import { createContext, useContext, type ReactNode } from 'react';
import { useCommunityVoice } from '@/hooks/useCommunityVoice';

type CommunityVoiceContextValue = ReturnType<typeof useCommunityVoice>;

const CommunityVoiceContext = createContext<CommunityVoiceContextValue | null>(null);

export function CommunityVoiceProvider({ children }: { children: ReactNode }) {
  const voice = useCommunityVoice();
  return (
    <CommunityVoiceContext.Provider value={voice}>
      {children}
    </CommunityVoiceContext.Provider>
  );
}

export function useCommunityVoiceContext() {
  const ctx = useContext(CommunityVoiceContext);
  if (!ctx) {
    throw new Error('useCommunityVoiceContext must be used within CommunityVoiceProvider');
  }
  return ctx;
}

/** Safe hook when provider may be absent */
export function useCommunityVoiceOptional() {
  return useContext(CommunityVoiceContext);
}
