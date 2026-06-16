import {
  agentActionSchema,
  agentPlanSchema,
  coerceAgentActionRaw,
  getActionRisk,
  partitionPlanByRisk,
  type AgentAction,
  type AgentPlan,
} from '@/lib/agent/agentToolSchema';
import type {
  ActionBatchResult,
  ActionBusEvent,
  ActionBusListener,
  ActionExecutionResult,
  ActionHandler,
  ActionHandlerContext,
  ExecutePlanOptions,
} from '@/lib/agent/actionBus/types';

export class AgentActionBus {
  private handlers = new Map<string, ActionHandler>();
  private listeners = new Set<ActionBusListener>();

  register(type: AgentAction['type'], handler: ActionHandler): () => void {
    this.handlers.set(type, handler);
    return () => this.handlers.delete(type);
  }

  subscribe(listener: ActionBusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  validateAction(raw: unknown): AgentAction | null {
    const coerced = coerceAgentActionRaw(raw);
    const parsed = agentActionSchema.safeParse(coerced);
    return parsed.success ? parsed.data : null;
  }

  validatePlan(raw: unknown): AgentPlan | null {
    const parsed = agentPlanSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  private emit(event: ActionBusEvent, action: AgentAction, result?: ActionExecutionResult) {
    for (const listener of this.listeners) {
      listener({ event, action, result });
    }
  }

  async execute(
    action: AgentAction,
    ctx: ActionHandlerContext,
  ): Promise<ActionExecutionResult> {
    const risk = getActionRisk(action);
    if (risk === 'deny') {
      const result: ActionExecutionResult = {
        ok: false,
        action,
        error: 'Action not permitted',
      };
      this.emit('error', action, result);
      return result;
    }
    if (risk === 'confirm') {
      const result: ActionExecutionResult = {
        ok: false,
        action,
        pendingConfirm: true,
      };
      return result;
    }

    const handler = this.handlers.get(action.type);
    if (!handler) {
      const result: ActionExecutionResult = {
        ok: false,
        action,
        error: `No handler for ${action.type}`,
      };
      this.emit('error', action, result);
      return result;
    }

    this.emit('before', action);
    try {
      const result = await handler(action, ctx);
      this.emit(result.ok ? 'after' : 'error', action, result);
      return result;
    } catch (err) {
      const result: ActionExecutionResult = {
        ok: false,
        action,
        error: err instanceof Error ? err.message : 'Handler failed',
      };
      this.emit('error', action, result);
      return result;
    }
  }

  async executePlan(
    plan: AgentPlan,
    options: ExecutePlanOptions = {},
  ): Promise<ActionBatchResult> {
    const ctx: ActionHandlerContext = { route: options.route ?? '/' };
    const { auto, confirm } = partitionPlanByRisk(plan);
    const queue = options.includeConfirm ? [...auto, ...confirm] : auto;

    const results: ActionExecutionResult[] = [];
    let executed = 0;
    let failed = 0;
    let pending = confirm.length;

    if (options.includeConfirm) pending = 0;

    for (const action of queue) {
      const result = await this.execute(action, ctx);
      results.push(result);
      if (result.pendingConfirm) {
        pending += 1;
        continue;
      }
      if (result.ok) executed += 1;
      else failed += 1;
      if (!result.ok && options.stopOnError) break;
    }

    if (!options.includeConfirm) {
      pending = confirm.length;
    }

    return { plan, results, executed, failed, pending };
  }
}
