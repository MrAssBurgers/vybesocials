import { createContext, useContext, ReactNode } from 'react';
import { useAdminDebugPanel } from '@/hooks/useAdminDebugPanel';

interface DebugPanelContextType {
  isOpen: boolean;
  setIsOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  isAdmin: boolean;
  handleLogoTap: () => void;
}

const DebugPanelContext = createContext<DebugPanelContextType | null>(null);

export function useDebugPanel() {
  return useContext(DebugPanelContext);
}

export function DebugPanelProvider({ children }: { children: ReactNode }) {
  const value = useAdminDebugPanel();
  return (
    <DebugPanelContext.Provider value={value}>
      {children}
    </DebugPanelContext.Provider>
  );
}
