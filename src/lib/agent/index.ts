export {
  AGENT_TOOL_NAME,
  AGENT_ACTION_TYPES,
  THEME_PRESET_KEYS,
  AGENT_ACTION_RISK,
  agentActionSchema,
  agentPlanSchema,
  agentContextSchema,
  parseAgentAction,
  parseAgentPlan,
  partitionPlanByRisk,
  getActionRisk,
} from '@/lib/agent/agentToolSchema';

export type {
  AgentAction,
  AgentPlan,
  AgentContext,
  AgentChatMessage,
  AgentResponse,
  AgentActionRisk,
} from '@/lib/agent/agentToolSchema';

export { AGENT_NAV_ALIASES, normalizeAgentPath, AGENT_ROUTE_HINT } from '@/lib/agent/agentRoutes';

export { AgentActionBus } from '@/lib/agent/actionBus/AgentActionBus';
export { AgentActionBusProvider, useAgentActionBus } from '@/lib/agent/actionBus/AgentActionBusProvider';
export { useAgentActions } from '@/lib/agent/useAgentActions';
export { useVybeAgent } from '@/lib/agent/useVybeAgent';

export type {
  ActionExecutionResult,
  ActionBatchResult,
  ActionHandler,
  ExecutePlanOptions,
} from '@/lib/agent/actionBus/types';
