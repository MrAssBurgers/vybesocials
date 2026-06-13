# VYBE Agent — Tool Schema & Action Bus

Phase 1 architecture for unified VYBE AI (chat + app control).

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  AIChat / VYBECommandBar  →  useVybeAgent()           │
└───────────────────────────┬─────────────────────────────┘
                            │ POST vybe-agent
                            ▼
┌─────────────────────────────────────────────────────────┐
│  supabase/functions/vybe-agent                          │
│  Tool: vybe_agent_act (see _shared/agentToolSchema.ts)  │
└───────────────────────────┬─────────────────────────────┘
                            │ { message, actions[] }
                            ▼
┌─────────────────────────────────────────────────────────┐
│  AgentActionBus (validate → risk tier → handler)        │
│  registerHandlers: navigate, theme, widgets             │
└─────────────────────────────────────────────────────────┘
```

## Tool schema (single source of truth)

| File | Role |
|------|------|
| `supabase/functions/_shared/agentToolSchema.ts` | OpenAI tool JSON + edge parse |
| `src/lib/agent/agentToolSchema.ts` | Zod types, risk tiers, client validation |

### Tool name: `vybe_agent_act`

Returns:

```json
{
  "message": "string — shown in chat",
  "actions": [ /* 0–12 typed actions */ ]
}
```

### Action types (Phase 1)

| type | fields | risk |
|------|--------|------|
| `navigate` | `path` | auto |
| `apply_theme` | `preset` | auto |
| `generate_theme` | `prompt` | auto |
| `widget_toggle` | `widget_id`, `visible?` | auto |
| `widget_reorder` | `order[]` | auto |

**Risk tiers:** `auto` runs immediately · `confirm` queued (Phase 2 UI) · `deny` blocked

### Adding a new action

1. Add to `AGENT_ACTION_TYPES` in **both** schema files
2. Add zod branch in `agentActionSchema`
3. Set `AGENT_ACTION_RISK[type]`
4. Register handler in `actionBus/registerHandlers.ts`
5. Update vybe-agent system prompt

## Action bus API

```typescript
const bus = useAgentActionBus();

bus.validatePlan(raw);      // zod → AgentPlan | null
bus.validateAction(raw);    // zod → AgentAction | null
await bus.execute(action, { route });
await bus.executePlan(plan, { route, includeConfirm: false });
bus.subscribe(({ event, action, result }) => { ... });
```

Provider: `AgentActionBusProvider` in `App.tsx` (inside `BrowserRouter`).

## Public exports

`import { useVybeAgent, useAgentActions, parseAgentPlan } from '@/lib/agent';`
