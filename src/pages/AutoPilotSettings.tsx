import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Sliders, Activity, ShieldCheck, Pause, Play, Trash2, RotateCcw,
  Zap, Eye, Heart, UserPlus, MessageSquare, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useDNAAutoPilot, AutoPilotIntensity } from '@/hooks/useDNAAutoPilot';
import { useLearningSignals } from '@/hooks/useLearningSignals';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const INTENSITY: { value: AutoPilotIntensity; label: string; desc: string }[] = [
  { value: 'gentle',   label: 'Gentle',   desc: 'Tiny nudges only' },
  { value: 'balanced', label: 'Balanced', desc: 'Recommended' },
  { value: 'bold',     label: 'Bold',     desc: 'Big remixes allowed' },
];

const CADENCE_LABELS = (m: number) => m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function AutoPilotSettings() {
  const nav = useNavigate();
  const { settings, loading, loadError, operationError, busy, clearing, updateSettings, clearAdaptationData, refresh } = useDNAAutoPilot();
  const { data: signals, loading: signalsLoading } = useLearningSignals();
  const [tab, setTab] = useState('settings');
  const [cadence, setCadence] = useState(360);
  useEffect(() => { if (settings) setCadence(settings.cadence_minutes); }, [settings?.cadence_minutes]);

  return (
    <div className="page-scroll-fix pb-24 relative">
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/30 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => nav(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Auto-Pilot
            </h1>
            <p className="text-xs text-muted-foreground">Tune what reshapes your VYBE</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full rounded-2xl">
            <TabsTrigger value="settings" className="rounded-xl"><Sliders className="w-3.5 h-3.5 mr-1" />Settings</TabsTrigger>
            <TabsTrigger value="signals"  className="rounded-xl"><Activity className="w-3.5 h-3.5 mr-1" />Signals</TabsTrigger>
            <TabsTrigger value="privacy"  className="rounded-xl"><ShieldCheck className="w-3.5 h-3.5 mr-1" />Privacy</TabsTrigger>
          </TabsList>
          {loadError && (
            <Card className="mt-4"><CardContent className="p-4 space-y-3" role="alert">
              <p className="text-sm text-muted-foreground">{loadError}</p>
              <Button variant="secondary" size="sm" className="rounded-full" onClick={() => void refresh()} disabled={loading}>Retry</Button>
            </CardContent></Card>
          )}
          {operationError && <p role="alert" className="text-sm text-destructive mt-3">{operationError}</p>}

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-3 mt-4">
            {loadError ? null : loading || !settings ? (
              <Card><CardContent className="py-8 text-center text-xs text-muted-foreground">Loading…</CardContent></Card>
            ) : (
              <>
                {/* Frequency */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Run frequency</Label>
                      <span className="text-xs text-muted-foreground">Every {CADENCE_LABELS(cadence)}</span>
                    </div>
                    <Slider
                      value={[cadence]} disabled={!!busy}
                      min={30} max={1440} step={30}
                      onValueChange={(v) => setCadence(v[0])}
                      onValueCommit={(v) => void updateSettings({ cadence_minutes: v[0] })}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>30m</span><span>6h</span><span>24h</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Triggers */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-sm font-semibold">When can it run?</Label>
                    {[
                      { k: 'trigger_on_post' as const,    icon: MessageSquare, label: 'After I post',         desc: 'Re-tune after fresh content' },
                      { k: 'trigger_on_follow' as const,  icon: UserPlus,      label: 'After I follow',       desc: 'React to your social moves' },
                      { k: 'trigger_on_session' as const, icon: Clock,         label: 'On long sessions',     desc: 'Reshape after deep scrolling' },
                    ].map(({ k, icon: Icon, label, desc }) => (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm">{label}</p>
                            <p className="text-[11px] text-muted-foreground">{desc}</p>
                          </div>
                        </div>
                        <Switch checked={!!settings[k]} disabled={!!busy} onCheckedChange={(v) => updateSettings({ [k]: v } as any)} />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Intensity */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-sm font-semibold">Max intensity</Label>
                    <p className="text-[11px] text-muted-foreground -mt-1">How aggressive feed/theme/layout changes can get.</p>
                    <div className="grid grid-cols-3 gap-2">
                      {INTENSITY.map(i => {
                        const active = settings.max_intensity === i.value;
                        return (
                          <button
                            key={i.value}
                            disabled={!!busy}
                            onClick={() => updateSettings({ max_intensity: i.value })}
                            className={cn(
                              "rounded-2xl p-3 text-center transition-all active:scale-95 border",
                              active
                                ? "bg-gradient-to-br from-primary to-accent text-primary-foreground border-transparent shadow-md shadow-primary/30"
                                : "bg-background border-border/40 text-foreground hover:bg-muted"
                            )}
                          >
                            <p className="text-xs font-semibold">{i.label}</p>
                            <p className={cn("text-[10px] mt-0.5", active ? "opacity-90" : "text-muted-foreground")}>{i.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* SIGNALS */}
          <TabsContent value="signals" className="space-y-3 mt-4">
            <Card className="bg-gradient-to-br from-primary/10 via-accent/5 to-transparent border-primary/20">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">
                  These are the actions you took in the last 30 days that shape your Auto-Pilot reshapes.
                </p>
              </CardContent>
            </Card>

            {signalsLoading || !signals ? (
              <Card><CardContent className="py-8 text-center text-xs text-muted-foreground">Loading signals…</CardContent></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: Heart,         label: 'Reactions', value: signals.likes30d },
                    { icon: UserPlus,      label: 'Follows',   value: signals.follows30d },
                    { icon: MessageSquare, label: 'Comments',  value: signals.comments30d },
                    { icon: Clock,         label: 'Watch min', value: signals.watchMinutes30d },
                  ].map(({ icon: Icon, label, value }) => (
                    <Card key={label}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-lg font-bold leading-none">{value}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{label} · 30d</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {signals.topInterests.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold mb-2">Top inferred interests</p>
                      <div className="flex flex-wrap gap-1.5">
                        {signals.topInterests.map(t => (
                          <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary">{t}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold mb-2">Recent learning signals</p>
                    {signals.recent.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-2">Nothing yet — interact more and check back.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {signals.recent.map((s, i) => (
                          <li key={i} className="flex items-center justify-between text-xs">
                            <span className="truncate flex-1">{s.label}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{timeAgo(s.at)} ago</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* PRIVACY */}
          <TabsContent value="privacy" className="space-y-3 mt-4">
            {!settings || loadError ? null : (
              <>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          {settings.learning_paused ? <Pause className="w-4 h-4 text-amber-500" /> : <Play className="w-4 h-4 text-emerald-500" />}
                          Pause learning
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Keep your current adaptations but stop building on them. Auto-Pilot won't learn from new actions.
                        </p>
                      </div>
                      <Switch
                        checked={settings.learning_paused}
                        disabled={!!busy}
                        onCheckedChange={(v) => updateSettings({ learning_paused: v })}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-primary" />
                          Opt out of personalization
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Turns Auto-Pilot off, removes your auto-theme, and keeps everything generic. You can opt back in anytime.
                        </p>
                      </div>
                      <Switch
                        checked={settings.personalization_opted_out}
                        disabled={!!busy}
                        onCheckedChange={(v) => {
                          updateSettings(v
                            ? { personalization_opted_out: true, mode: 'off', learning_paused: true }
                            : { personalization_opted_out: false });
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-destructive/30">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2 text-destructive">
                        <Trash2 className="w-4 h-4" /> Clear adaptation data
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Wipes auto-theme, agent action history, boosted/reduced topics, and resets discovery. Your DNA personality vector stays.
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="w-full rounded-full" disabled={!!busy}>
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> {clearing ? 'Clearing adaptation data…' : 'Clear my adaptation data'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear adaptation data?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes your auto-theme, all Auto-Pilot history, and resets feed preferences. Cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={clearAdaptationData} disabled={clearing} className="bg-destructive text-destructive-foreground">
                            Clear everything
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
