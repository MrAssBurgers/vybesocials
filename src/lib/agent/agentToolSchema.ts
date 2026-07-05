/**
 * VYBE agent tool schema (client) — zod validation + risk tiers.
 * Edge JSON tool def: db/functions/_shared/agentToolSchema.ts
 */
import { z } from 'zod';
import { normalizeAgentPath } from '@/lib/agent/agentRoutes';

export const AGENT_TOOL_NAME = 'vybe_agent_act' as const;

export const AGENT_ACTION_TYPES = [
  'navigate',
  'apply_theme',
  'generate_theme',
  'widget_toggle',
  'widget_reorder',
] as const;

export const THEME_PRESET_KEYS = [
  'classic',
  'midnight',
  'neon',
  'soft',
  'cyberpunk',
  'custom',
] as const;

/** auto = execute immediately; confirm = queue for user approval (Phase 2+) */
export type AgentActionRisk = 'auto' | 'confirm' | 'deny';

export const AGENT_ACTION_RISK: Record<(typeof AGENT_ACTION_TYPES)[number], AgentActionRisk> = {
  navigate: 'auto',
  apply_theme: 'auto',
  generate_theme: 'auto',
  widget_toggle: 'auto',
  widget_reorder: 'auto',
};

const navigateActionSchema = z.object({
  type: z.literal('navigate'),
  path: z.string().min(1),
});

const applyThemeActionSchema = z.object({
  type: z.literal('apply_theme'),
  preset: z.enum(THEME_PRESET_KEYS),
});

const generateThemeActionSchema = z.object({
  type: z.literal('generate_theme'),
  prompt: z.string().min(1).max(500),
});

const widgetToggleActionSchema = z.object({
  type: z.literal('widget_toggle'),
  widget_id: z.string().min(1),
  visible: z.boolean().optional(),
});

const widgetReorderActionSchema = z.object({
  type: z.literal('widget_reorder'),
  order: z.array(z.string().min(1)).min(1),
});

export const agentActionSchema = z.discriminatedUnion('type', [
  navigateActionSchema,
  applyThemeActionSchema,
  generateThemeActionSchema,
  widgetToggleActionSchema,
  widgetReorderActionSchema,
]);

export type AgentAction = z.infer<typeof agentActionSchema>;

export const agentPlanSchema = z.object({
  message: z.string().min(1).max(8000),
  actions: z.array(agentActionSchema).max(12),
  planId: z.string().uuid().optional(),
});

export type AgentPlan = z.infer<typeof agentPlanSchema>;

export const agentContextSchema = z.object({
  route: z.string(),
  layout: z.object({
    order: z.array(z.string()),
    hidden: z.array(z.string()),
  }),
  currentPreset: z.string().optional(),
  widgetCatalog: z.array(z.string()).optional(),
});

export type AgentContext = z.infer<typeof agentContextSchema>;

export const agentChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(8000),
});

export type AgentChatMessage = z.infer<typeof agentChatMessageSchema>;

export interface AgentResponse extends AgentPlan {
  error?: string;
}

/** Coerce raw model output before zod (aliases, trim paths) */
export function coerceAgentActionRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const a = raw as Record<string, unknown>;
  if (a.type === 'navigate' && typeof a.path === 'string') {
    const normalized = normalizeAgentPath(a.path.trim());
    if (normalized) return { ...a, path: normalized };
  }
  if (a.type === 'widget_toggle' && typeof a.widget_id === 'string') {
    const id = a.widget_id.trim().replace(/\s+/g, '_');
    return { ...a, widget_id: id };
  }
  return raw;
}

/** Validate a single action from API; returns null if invalid */
export function parseAgentAction(raw: unknown): AgentAction | null {
  const result = agentActionSchema.safeParse(coerceAgentActionRaw(raw));
  return result.success ? result.data : null;
}

/** Validate full agent plan from vybe-agent */
export function parseAgentPlan(raw: unknown): AgentPlan | null {
  const result = agentPlanSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Split plan into auto vs confirm buckets */
export function partitionPlanByRisk(plan: AgentPlan): {
  auto: AgentAction[];
  confirm: AgentAction[];
  denied: AgentAction[];
} {
  const auto: AgentAction[] = [];
  const confirm: AgentAction[] = [];
  const denied: AgentAction[] = [];
  for (const action of plan.actions) {
    const risk = AGENT_ACTION_RISK[action.type];
    if (risk === 'auto') auto.push(action);
    else if (risk === 'confirm') confirm.push(action);
    else denied.push(action);
  }
  return { auto, confirm, denied };
}

export function getActionRisk(action: AgentAction): AgentActionRisk {
  return AGENT_ACTION_RISK[action.type];
}
