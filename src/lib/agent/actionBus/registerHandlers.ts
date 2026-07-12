import { toast } from 'sonner';
import { equipTheme, THEME_PRESETS } from '@/hooks/useCustomTheme';
import type { ThemeTokens } from '@/hooks/useCustomTheme';
import { readLastGeneratedTheme } from '@/lib/theme/lastGeneratedTheme';
import { normalizeAgentPath } from '@/lib/agent/agentRoutes';
import type { AgentActionBus } from '@/lib/agent/actionBus/AgentActionBus';
import type {
  ActionExecutionResult,
  ActionHandlerContext,
} from '@/lib/agent/actionBus/types';
import type { AgentAction } from '@/lib/agent/agentToolSchema';

export interface ActionHandlerDeps {
  navigate: (path: string) => void;
  setGlobalTheme: (mode: 'light' | 'dark') => void;
  generateTheme: (input: { prompt: string }) => Promise<ThemeTokens>;
  layoutHidden: string[];
  toggleWidget: (widgetId: string) => void;
  reorderWidgets: (order: string[]) => void;
}

function ok(action: AgentAction): ActionExecutionResult {
  return { ok: true, action };
}

function fail(action: AgentAction, error: string): ActionExecutionResult {
  return { ok: false, action, error };
}

/** Register all Phase 1 action handlers on the bus */
export function registerAgentActionHandlers(
  bus: AgentActionBus,
  deps: ActionHandlerDeps,
): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    bus.register('navigate', async (action, _ctx: ActionHandlerContext) => {
      const path = normalizeAgentPath(action.path);
      if (!path) return fail(action, 'Invalid or blocked route');
      deps.navigate(path);
      toast.success('On your way ✨', { duration: 1500 });
      return ok(action);
    }),
  );

  unsubs.push(
    bus.register('apply_theme', async (action) => {
      const presetKey = action.preset === 'minimal' ? 'custom' : action.preset;
      const preset =
        presetKey === 'custom'
          ? readLastGeneratedTheme() ?? THEME_PRESETS.custom
          : THEME_PRESETS[presetKey];
      if (!preset) return fail(action, `Unknown preset: ${action.preset}`);
      deps.setGlobalTheme(preset.mode === 'light' ? 'light' : 'dark');
      equipTheme(preset, { silent: true });
      toast.success(`Applied ${action.preset} theme`);
      return ok(action);
    }),
  );

  unsubs.push(
    bus.register('generate_theme', async (action) => {
      const loading = toast.loading('Generating your theme…');
      try {
        const theme = await deps.generateTheme({ prompt: action.prompt });
        toast.dismiss(loading);
        deps.setGlobalTheme(theme.mode === 'light' ? 'light' : 'dark');
        equipTheme(theme, { silent: true, basePreset: 'custom' });
        toast.success('Custom theme applied');
        return ok(action);
      } catch {
        toast.dismiss(loading);
        return fail(action, 'Theme generation failed');
      }
    }),
  );

  unsubs.push(
    bus.register('widget_toggle', async (action) => {
      const hidden = deps.layoutHidden.includes(action.widget_id);
      const wantVisible = action.visible ?? true;
      if ((wantVisible && hidden) || (!wantVisible && !hidden)) {
        deps.toggleWidget(action.widget_id);
      }
      toast.success(wantVisible ? 'Widget shown' : 'Widget hidden');
      return ok(action);
    }),
  );

  unsubs.push(
    bus.register('widget_reorder', async (action) => {
      deps.reorderWidgets(action.order);
      toast.success('Home layout updated');
      return ok(action);
    }),
  );

  return () => unsubs.forEach((u) => u());
}
