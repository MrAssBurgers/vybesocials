import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { recordAgentAuthFailure } from '@/lib/agent/aiChatRouting';
import { getEdgeFunctionUrl, getFunctionAuthHeaders, refreshAuthSessionWithTimeout } from '@/lib/functionAuth';
import { fetchWithTimeout } from '@/lib/withTimeout';
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
    // 401 uses the same JWT gate as ai-chat — fallback would hang or double-fail silently
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
        8_000,
      );

      if (res.status === 404) {
        markAgentUnavailable();
      }

      if (res.status === 401 && !retriedAfterRefresh) {
        try {
          const { data: refreshed, error } = await refreshAuthSessionWithTimeout();
          if (!error && refreshed.session?.access_token) {
            return postVybeAgent(options, true);
          }
        } catch {
          recordAgentAuthFailure();
        }
        recordAgentAuthFailure();
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

      if (!res.ok) {
        const msg =
          res.status === 401
            ? 'Session expired — sign out and back in, then try again'
            : raw.error || 'Agent request failed';
        throw new AgentRequestError(msg, res.status);
      }

      const validated = validatePlan(raw);
      if (validated) {
        clearAgentUnavailableMark();
        return validated;
      }

      const message =
        typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : 'Done!';
      const actions = (Array.isArray(raw.actions) ? raw.actions : [])
        .map((a) => bus.validateAction(a))
        .filter((a): a is AgentAction => a !== null);

      return { message, actions };
    },
    [postVybeAgent, validatePlan, bus],
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
