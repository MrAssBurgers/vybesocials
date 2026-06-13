import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionUrl, getFunctionAuthHeaders } from '@/lib/functionAuth';
import { fetchWithTimeout } from '@/lib/withTimeout';
import { useHomeLayout, ALL_WIDGETS } from '@/hooks/useHomeLayout';
import { useAgentActions } from '@/lib/agent/useAgentActions';
import { agentDebugLog } from '@/lib/agent/agentDebugLog';
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

/** True when vybe-agent edge fn is missing or unreachable — safe to fall back to ai-chat */
export function isAgentUnavailableError(err: unknown): boolean {
  if (err instanceof AgentRequestError) {
    return err.status === 404 || err.status === 502 || err.status === 503;
  }
  if (err instanceof Error) {
    return /fetch|network|timeout|Failed to fetch|abort/i.test(err.message);
  }
  return false;
}

export function isAgentAuthError(err: unknown): boolean {
  return err instanceof AgentRequestError && err.status === 401;
}

/** Whether a failed agent request should fall back to streaming ai-chat instead of stopping */
export function shouldFallbackToAiChat(err: unknown): boolean {
  if (err instanceof AgentRequestError) {
    // 401 after refresh, undeployed fn, AI misconfig, gateway errors — chat may still work
    return (
      err.status === 401 ||
      err.status === 404 ||
      err.status === 500 ||
      err.status === 502 ||
      err.status === 503
    );
  }
  if (err instanceof Error) {
    if (err.message === 'Not authenticated') return true;
    return /fetch|network|timeout|Failed to fetch|abort/i.test(err.message);
  }
  return true;
}

async function parseAgentResponseBody(res: Response): Promise<{
  message?: string;
  actions?: unknown[];
  error?: string;
}> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { message?: string; actions?: unknown[]; error?: string };
  } catch {
    return { error: text.slice(0, 200) || res.statusText };
  }
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

  const postVybeAgent = useCallback(
    async (
      options: {
        messages: AgentChatMessage[];
        aiName?: string;
        aiPersonality?: string;
        feedDNA?: boolean;
        location?: { lat: number; lng: number; city?: string } | null;
      },
      retriedAfterRefresh = false,
    ): Promise<Response> => {
      // #region agent log
      agentDebugLog('useVybeAgent:postVybeAgent', 'request start', {
        retriedAfterRefresh,
        route: location.pathname,
        messageCount: options.messages.length,
      }, 'H5-auth');
      // #endregion

      const headers = await getFunctionAuthHeaders();
      const res = await fetchWithTimeout(
        getEdgeFunctionUrl('vybe-agent'),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: options.messages,
            aiName: options.aiName,
            aiPersonality: options.aiPersonality,
            feedDNA: options.feedDNA,
            location: options.location,
            context: buildContext(),
          }),
        },
        60000,
      );

      if (res.status === 401 && !retriedAfterRefresh) {
        // #region agent log
        agentDebugLog('useVybeAgent:postVybeAgent', '401 — refreshing session', {}, 'H5-auth');
        // #endregion
        const { error } = await supabase.auth.refreshSession();
        if (!error) {
          return postVybeAgent(options, true);
        }
      }

      return res;
    },
    [buildContext, location.pathname],
  );

  const sendAgentMessage = useCallback(
    async (options: {
      messages: AgentChatMessage[];
      aiName?: string;
      aiPersonality?: string;
      feedDNA?: boolean;
      location?: { lat: number; lng: number; city?: string } | null;
    }): Promise<AgentPlan & { error?: string }> => {
      const res = await postVybeAgent(options);
      const raw = await parseAgentResponseBody(res);

      // #region agent log
      agentDebugLog('useVybeAgent:sendAgentMessage', 'vybe-agent response', {
        status: res.status,
        ok: res.ok,
        actionCount: Array.isArray(raw.actions) ? raw.actions.length : 0,
        error: raw.error,
      }, 'H1-deploy');
      // #endregion

      if (!res.ok) {
        const msg =
          res.status === 401
            ? 'Session expired — sign out and back in, then try again'
            : raw.error || 'Agent request failed';
        throw new AgentRequestError(msg, res.status);
      }

      const validated = validatePlan(raw);
      if (validated) return validated;

      const message =
        typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : 'Done!';
      const actions = (Array.isArray(raw.actions) ? raw.actions : [])
        .map((a) => bus.validateAction(a))
        .filter((a): a is AgentAction => a !== null);

      // #region agent log
      agentDebugLog('useVybeAgent:sendAgentMessage', 'partial plan recovery', {
        validatedActions: actions.length,
        rawActions: Array.isArray(raw.actions) ? raw.actions.length : 0,
      }, 'H3-validate');
      // #endregion

      return { message, actions };
    },
    [postVybeAgent, validatePlan, bus],
  );

  const sendAndExecute = useCallback(
    async (options: Parameters<typeof sendAgentMessage>[0]) => {
      const plan = await sendAgentMessage(options);
      const batch = await executePlan(plan);

      // #region agent log
      agentDebugLog('useVybeAgent:sendAndExecute', 'bus batch', {
        executed: batch.executed,
        failed: batch.failed,
        pending: batch.pending,
        total: batch.results.length,
      }, 'H4-bus');
      // #endregion

      return { ...plan, batch };
    },
    [executePlan, sendAgentMessage],
  );

  return { sendAgentMessage, sendAndExecute, buildContext, executePlan, bus };
}
