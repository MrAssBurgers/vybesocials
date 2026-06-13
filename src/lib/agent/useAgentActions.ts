import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAgentActionBus } from '@/lib/agent/actionBus/AgentActionBusProvider';
import type { AgentAction, AgentPlan } from '@/lib/agent/agentToolSchema';
import type { ActionBatchResult, ActionExecutionResult } from '@/lib/agent/actionBus/types';

/** Hook for executing validated agent actions via the global bus */
export function useAgentActions() {
  const bus = useAgentActionBus();
  const location = useLocation();

  const executeAction = useCallback(
    async (action: AgentAction): Promise<ActionExecutionResult> => {
      return bus.execute(action, { route: location.pathname });
    },
    [bus, location.pathname],
  );

  const executeActions = useCallback(
    async (actions: AgentAction[]): Promise<ActionBatchResult> => {
      return bus.executePlan(
        { message: '', actions },
        { route: location.pathname },
      );
    },
    [bus, location.pathname],
  );

  const executePlan = useCallback(
    async (plan: AgentPlan): Promise<ActionBatchResult> => {
      return bus.executePlan(plan, { route: location.pathname });
    },
    [bus, location.pathname],
  );

  return {
    bus,
    executeAction,
    executeActions,
    executePlan,
    validatePlan: bus.validatePlan.bind(bus),
    validateAction: bus.validateAction.bind(bus),
  };
}
