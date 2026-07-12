import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useHomeLayout } from '@/hooks/useHomeLayout';
import { useGenerateTheme } from '@/hooks/useCustomTheme';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { AgentActionBus } from '@/lib/agent/actionBus/AgentActionBus';
import { registerAgentActionHandlers } from '@/lib/agent/actionBus/registerHandlers';

const AgentActionBusContext = createContext<AgentActionBus | null>(null);

export function AgentActionBusProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { layout, toggleWidget, reorderWidgets } = useHomeLayout();
  const generateTheme = useGenerateTheme();
  const { setTheme: setGlobalTheme } = useTheme();
  const { user } = useAuth();
  const busRef = useRef<AgentActionBus | null>(null);

  if (!busRef.current) {
    busRef.current = new AgentActionBus();
  }
  const bus = busRef.current;

  useEffect(() => {
    return registerAgentActionHandlers(bus, {
      navigate,
      userId: user?.id,
      setGlobalTheme,
      generateTheme: (input) => generateTheme.mutateAsync(input),
      layoutHidden: layout.hidden,
      toggleWidget,
      reorderWidgets,
    });
  }, [
    bus,
    navigate,
    user?.id,
    setGlobalTheme,
    generateTheme,
    layout.hidden,
    toggleWidget,
    reorderWidgets,
  ]);

  const value = useMemo(() => bus, [bus]);

  // Expose route on bus for consumers via executePlan options
  void location.pathname;

  return (
    <AgentActionBusContext.Provider value={value}>
      {children}
    </AgentActionBusContext.Provider>
  );
}

export function useAgentActionBus(): AgentActionBus {
  const bus = useContext(AgentActionBusContext);
  if (!bus) {
    throw new Error('useAgentActionBus must be used within AgentActionBusProvider');
  }
  return bus;
}
