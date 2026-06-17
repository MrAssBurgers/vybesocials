import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { recordAgentAuthFailure } from '@/lib/agent/aiChatRouting';
import { refreshAuthSessionWithTimeout } from '@/lib/functionAuth';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { useHomeLayout, ALL_WIDGETS } from '@/hooks/useHomeLayout';
import { useAgentActions } from '@/lib/agent/useAgentActions';
import { markAgentUnavailable, clearAgentUnavailableMark } from '@/lib/agent/agentAvailability';
import { type AgentChatMessage, type AgentContext, type AgentPlan, type AgentAction } from '@/lib/agent/agentToolSchema';

function readEquippedPreset(): string {
  try {
    return localStorage.getItem('vybe-equipped-theme-id') || 'classic';
  } catch {
    return 'classic';
  }
}

export class AgentRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AgentRequestError';
    this.status = status;
  }
}

/** True when vybe-agent is missing or unreachable — safe to fall back to ai-chat */
export function isAgentUnavailableError(err: unknown): boolean {
  if (err instanceof AgentRequestError) {
    return err.status === 404 || err.status === 502 || err.status === 503;
  }
  if (err instanceof Error) {
    return /fetch|network|timeout|Failed to fetch|abort|not_yet_ported/i.test(err.message);
  }
  return false;
}

export function isAgentAuthError(err: unknown): boolean {
  return err instanceof AgentRequestError && err.status === 401;
}

/** Whether a failed agent request should fall back to streaming ai-chat instead of stopping */
export function shouldFallbackToAiChat(err: unknown): boolean {
  if (err instanceof AgentRequestError) {
    if (err.status === 401) return false;
    return (
      err.status === 404 ||
      err.status === 500 ||
      err.status === 502 ||
      err.status === 503
    );
  }
  if (err instanceof Error) {
    if (err.message === 'Not authenticated') return false;
    return /fetch|network|timeout|Failed to fetch|abort/i.test(err.message);
  }
  return true;
}

export function useVybeAgent() {
  const location = useLocation();
  const { layout } = useHomeLayout();
  const { executePlan, validatePlan, bus } = useAgentActions();

  const buildContext = useCallback((): AgentContext => {
    return {
      route: location.pathname,
      layout: { order: layout.order, hidden: layout.hidden },
      currentPreset: readEquippedPreset(),
      widgetCatalog: ALL_WIDGETS.map((w) => w.id),
    };
  }, [layout.hidden, layout.order, location.pathname]);

  const callVybeAgent = useCallback(
    async (
      options: {
        messages: AgentChatMessage[];
        aiName?: string;
        aiPersonality?: string;
        feedDNA?: boolean;
        location?: { lat: number; lng: number; city?: string } | null;
      },
      retriedAfterRefresh = false,
    ): Promise<AgentPlan & { error?: string }> => {
      const { data, error } = await invokeFunction<AgentPlan & { error?: string }>('vybe-agent', {
        messages: options.messages,
        aiName: options.aiName,
        aiPersonality: options.aiPersonality,
        feedDNA: options.feedDNA,
        location: options.location,
        context: buildContext(),
      });

      if (error) {
        const code = error.name || '';
        if (
          (code === 'unauthenticated' || /unauthenticated|Not authenticated/i.test(error.message)) &&
          !retriedAfterRefresh
        ) {
          try {
            const { data: refreshed, error: refreshErr } = await refreshAuthSessionWithTimeout();
            if (!refreshErr && refreshed.session?.access_token) {
              return callVybeAgent(options, true);
            }
          } catch {
            recordAgentAuthFailure();
          }
          recordAgentAuthFailure();
          throw new AgentRequestError('Session expired — sign out and back in, then try again', 401);
        }
        if (code === 'not_found' || code === 'not_yet_ported') {
          markAgentUnavailable();
          throw new AgentRequestError(error.message, 404);
        }
        throw new AgentRequestError(error.message, 500);
      }

      if (data?.error) {
        throw new AgentRequestError(data.error, 500);
      }

      clearAgentUnavailableMark();
      const validated = validatePlan(data);
      if (validated) return validated;

      const message =
        typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : 'Done!';
      const actions = (Array.isArray(data?.actions) ? data.actions : [])
        .map((a) => bus.validateAction(a))
        .filter((a): a is AgentAction => a !== null);

      return { message, actions };
    },
    [buildContext, validatePlan, bus],
  );

  const sendAgentMessage = useCallback(
    async (options: Parameters<typeof callVybeAgent>[0]) => callVybeAgent(options),
    [callVybeAgent],
  );

  const sendAndExecute = useCallback(
    async (options: Parameters<typeof sendAgentMessage>[0]) => {
      const plan = await sendAgentMessage(options);
      const batch = await executePlan(plan);
      return { ...plan, batch };
    },
    [executePlan, sendAgentMessage],
  );

  return { sendAgentMessage, sendAndExecute, buildContext, executePlan, bus };
}
