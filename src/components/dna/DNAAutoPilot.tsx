import { useDNAAutoPilot, AutoPilotMode } from '@/hooks/useDNAAutoPilot';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap, Eye, Pause, RotateCcw, Check, Wand2, Palette, LayoutGrid, MessageCircleHeart } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODES: { value: AutoPilotMode; label: string; icon: any; desc: string }[] = [
  { value: 'off', label: 'Off', icon: Pause, desc: 'No changes' },
  { value: 'suggest', label: 'Suggest', icon: Eye, desc: 'Review first' },
  { value: 'autonomous', label: 'Autonomous', icon: Zap, desc: 'Just do it' },
];

const ICON_FOR_TYPE: Record<string, any> = {
  feed_tune: Wand2,
  theme_swap: Palette,
  layout_change: LayoutGrid,
  nudge: MessageCircleHeart,
  suggest_user: Sparkles,
};

function timeAgo(iso: string | null) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DNAAutoPilot() {
  const { settings, actions, loading, running, setMode, runNow, revert, applyPending } = useDNAAutoPilot();
  const mode: AutoPilotMode = settings?.mode || 'suggest';
  const isOn = mode !== 'off';

  return (
    <div className="space-y-3">
      {/* Hero card */}
      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-accent/10 to-transparent">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-4">
            <div className={cn(
              "relative shrink-0 h-14 w-14 rounded-2xl flex items-center justify-center",
              "bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/40",
              isOn && "animate-pulse"
            )}>
              <Sparkles className="w-7 h-7 text-primary-foreground" />
              {isOn && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-background" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold leading-tight">VYBE Auto-Pilot</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isOn
                  ? `Reshaping your VYBE in the background · last tuned ${timeAgo(settings?.last_run_at || null)}`
                  : 'Paused · turn on to let your DNA reshape your experience'}
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-background/60 border border-border/40">
            {MODES.map(({ value, label, icon: Icon, desc }) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-medium transition-all active:scale-95",
                    active
                      ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md shadow-primary/30"
                      : "text-muted-foreground hover:bg-background"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                  <span className={cn("text-[9px] opacity-80", !active && "hidden sm:block")}>{desc}</span>
                </button>
              );
            })}
          </div>

          <Button
            onClick={runNow}
            disabled={running || !isOn}
            className="w-full rounded-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            <Zap className={cn("w-4 h-4 mr-2", running && "animate-pulse")} />
            {running ? 'Tuning your VYBE...' : 'Run Auto-Pilot now'}
          </Button>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">What I changed for you</h3>
            <span className="text-[10px] text-muted-foreground">{actions.length} action{actions.length === 1 ? '' : 's'}</span>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
          ) : actions.length === 0 ? (
            <div className="py-6 text-center">
              <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-xs text-muted-foreground">
                Auto-Pilot hasn't tuned anything yet. Tap <span className="font-semibold">Run</span> above to kick it off.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {actions.map(a => {
                const Icon = ICON_FOR_TYPE[a.action_type] || Sparkles;
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "rounded-2xl border p-3 flex gap-3 items-start transition-colors",
                      a.reverted ? "border-border/30 opacity-60" :
                      a.applied ? "border-primary/30 bg-primary/5" :
                                  "border-accent/40 bg-accent/5"
                    )}
                  >
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">{a.summary}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>{timeAgo(a.created_at)}</span>
                        <span>·</span>
                        <span className="capitalize">{a.action_type.replace('_', ' ')}</span>
                        {a.reverted && <span className="text-destructive">· reverted</span>}
                        {!a.applied && !a.reverted && <span className="text-accent">· pending</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {!a.applied && !a.reverted && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => applyPending(a.id)}>
                          <Check className="w-3 h-3 mr-1" /> Apply
                        </Button>
                      )}
                      {a.applied && !a.reverted && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => revert(a.id)}>
                          <RotateCcw className="w-3 h-3 mr-1" /> Undo
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
