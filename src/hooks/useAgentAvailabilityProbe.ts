import { useEffect } from 'react';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { isAgentMarkedUnavailable, markAgentUnavailable } from '@/lib/agent/agentAvailability';

/** One-time probe: skip vybe-agent when Cloud Function is not deployed. */
export function useAgentAvailabilityProbe(): void {
  useEffect(() => {
    if (isAgentMarkedUnavailable()) return;
    void invokeFunction('vybe-agent', {
      messages: [{ role: 'user', content: 'ping' }],
      context: { route: '/home' },
    }).then(({ error }) => {
      if (error?.name === 'not_yet_ported' || error?.name === 'not_found') {
        markAgentUnavailable();
      }
    });
  }, []);
}
