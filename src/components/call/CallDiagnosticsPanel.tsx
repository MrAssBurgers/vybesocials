import { Activity, Wifi, Gauge, Signal, Video, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallDiagnostics, isCallDebugEnabled } from '@/lib/callDiagnostics';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface CallDiagnosticsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function StatRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-medium text-right', mono && 'font-mono tabular-nums')}>
        {value}
      </span>
    </div>
  );
}

export function CallDiagnosticsPanel({ open, onOpenChange }: CallDiagnosticsPanelProps) {
  const stats = useCallDiagnostics();

  if (!isCallDebugEnabled()) return null;

  const resolution =
    stats.videoWidth > 0 ? `${stats.videoWidth}×${stats.videoHeight}` : '—';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl border-white/10 bg-background/95 backdrop-blur-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Call diagnostics
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 overflow-y-auto pb-8">
          <section>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Signal className="h-3 w-3" /> Connection
            </p>
            <StatRow label="Transport" value={stats.connectionType.toUpperCase()} />
            <StatRow label="Connection state" value={stats.connectionState} />
            <StatRow label="Signaling" value={stats.signalingState} />
            <StatRow label="ICE" value={stats.iceState} />
            <StatRow label="TURN relay" value={stats.turnInUse ? 'Yes' : 'No'} />
            <StatRow label="Quality" value={stats.quality} />
          </section>

          <section>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Video className="h-3 w-3" /> Video
            </p>
            <StatRow label="Resolution" value={resolution} mono />
            <StatRow label="FPS" value={stats.fps > 0 ? String(Math.round(stats.fps)) : '—'} mono />
            <StatRow
              label="Video bitrate"
              value={stats.videoBitrateKbps > 0 ? `${Math.round(stats.videoBitrateKbps)} kbps` : '—'}
              mono
            />
          </section>

          <section>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Wifi className="h-3 w-3" /> Network
            </p>
            <StatRow
              label="Audio bitrate"
              value={stats.audioBitrateKbps > 0 ? `${Math.round(stats.audioBitrateKbps)} kbps` : '—'}
              mono
            />
            <StatRow
              label="Packet loss"
              value={stats.packetLossPct > 0 ? `${stats.packetLossPct.toFixed(1)}%` : '0%'}
              mono
            />
            <StatRow
              label="RTT / latency"
              value={stats.latencyMs > 0 ? `${Math.round(stats.latencyMs)} ms` : '—'}
              mono
            />
          </section>

          <section>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Meta
            </p>
            <StatRow
              label="Last update"
              value={
                stats.updatedAt > 0
                  ? new Date(stats.updatedAt).toLocaleTimeString()
                  : '—'
              }
            />
          </section>

          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            Add <code className="text-[10px]">?callDebug=1</code> to URL in production.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
