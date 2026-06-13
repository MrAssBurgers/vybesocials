import type { ActionBatchResult } from '@/lib/agent/actionBus/types';

const ACTION_LABELS: Record<string, string> = {
  navigate: 'Navigation',
  apply_theme: 'Theme',
  generate_theme: 'Custom theme',
  widget_toggle: 'Home widget',
  widget_reorder: 'Home layout',
};

/** Short footnote for chat when the bus ran actions */
export function formatAgentActionSummary(batch: ActionBatchResult): string {
  if (batch.results.length === 0) return '';

  const lines: string[] = [];
  for (const r of batch.results) {
    const label = ACTION_LABELS[r.action.type] ?? r.action.type;
    if (r.ok) lines.push(`✓ ${label}`);
    else if (r.pendingConfirm) lines.push(`⏳ ${label} (needs confirm)`);
    else lines.push(`✗ ${label}${r.error ? `: ${r.error}` : ''}`);
  }
  return `\n\n${lines.join(' · ')}`;
}
