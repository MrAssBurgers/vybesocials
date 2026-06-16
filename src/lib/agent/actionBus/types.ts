import type { AgentAction, AgentPlan } from '@/lib/agent/agentToolSchema';

export type ActionBusEvent = 'before' | 'after' | 'error';

export interface ActionHandlerContext {
  /** Current app route when action runs */
  route: string;
}

export interface ActionExecutionResult {
  ok: boolean;
  action: AgentAction;
  error?: string;
  /** Set when risk tier requires confirmation (not executed yet) */
  pendingConfirm?: boolean;
}

export interface ActionBatchResult {
  plan: AgentPlan;
  results: ActionExecutionResult[];
  executed: number;
  failed: number;
  pending: number;
}

export type ActionHandler = (
  action: any,
  ctx: ActionHandlerContext,
) => Promise<ActionExecutionResult>;

export type ActionBusListener = (payload: {
  event: ActionBusEvent;
  action: AgentAction;
  result?: ActionExecutionResult;
}) => void;

export interface ExecutePlanOptions {
  route?: string;
  /** If false, only run actions with risk auto (default true = auto only) */
  includeConfirm?: boolean;
  stopOnError?: boolean;
}
