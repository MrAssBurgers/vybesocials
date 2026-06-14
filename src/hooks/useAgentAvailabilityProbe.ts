import { useEffect } from 'react';
import { getEdgeFunctionUrl } from '@/lib/functionAuth';
import { getCanonicalPublishableKey } from '@/lib/canonicalSupabase';
import { isAgentMarkedUnavailable, markAgentUnavailable } from '@/lib/agent/agentAvailability';

/** One-time probe: skip vybe-agent when edge fn is not deployed (404). */
export function useAgentAvailabilityProbe(): void {
  useEffect(() => {
    if (isAgentMarkedUnavailable()) return;
    fetch(getEdgeFunctionUrl('vybe-agent'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getCanonicalPublishableKey(),
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
    })
      .then((res) => {
        if (res.status === 404) markAgentUnavailable();
      })
      .catch(() => {});
  }, []);
}
