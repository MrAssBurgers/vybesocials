import { AGENT_NAV_ALIASES, normalizeAgentPath } from '@/lib/agent/agentRoutes';
import type { AgentAction, AgentPlan } from '@/lib/agent/agentToolSchema';
import { THEME_PRESET_KEYS } from '@/lib/agent/agentToolSchema';

const OPEN_RE = /(?:open|go to|show|take me to|navigate to)\s+(?:the\s+)?(.+)/i;
const THEME_RE = /(?:use|switch to|apply|make it)\s+(classic|midnight|neon|soft|cyberpunk|minimal)(?:\s+theme)?/i;

/** Offline fallback when vybe-agent edge fn is not deployed yet. */
export function parseLocalAgentPlan(text: string): AgentPlan | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const actions: AgentAction[] = [];

  const themeMatch = trimmed.match(THEME_RE);
  if (themeMatch) {
    const preset = themeMatch[1].toLowerCase() as (typeof THEME_PRESET_KEYS)[number];
    if (THEME_PRESET_KEYS.includes(preset)) {
      actions.push({ type: 'apply_theme', preset });
    }
  }

  const openMatch = trimmed.match(OPEN_RE);
  if (openMatch) {
    const target = openMatch[1].trim().replace(/[.!?]+$/, '');
    const aliasKey = target.toLowerCase().replace(/\s+/g, '_');
    const path = normalizeAgentPath(AGENT_NAV_ALIASES[aliasKey] ?? target);
    if (path) actions.push({ type: 'navigate', path });
  }

  if (actions.length === 0) return null;

  const label = actions[0].type === 'navigate' ? 'Opening that for you' : 'Updating your VYBE';
  return { message: `${label} ✨`, actions };
}
