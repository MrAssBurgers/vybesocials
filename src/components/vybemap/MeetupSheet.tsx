import { useState } from 'react';
import { Navigation, Users, MapPin, Plus, LogOut, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { MapMeetup } from '@/lib/vybemap/types';
import { useLocationIntel } from '@/hooks/vybemap/useLocationIntel';
import { LocationIntelPanel } from '@/components/vybemap/LocationIntelPanel';
import { MapLiquidSheet } from '@/components/vybemap/MapLiquidSheet';
import { cn } from '@/lib/utils';

interface MeetupSheetProps {
  meetup: MapMeetup;
  myCoords: [number, number] | null;
  profileId?: string;
  isMember: boolean;
  isHost: boolean;
  onClose: () => void;
  onJoin: () => Promise<void>;
  onLeave: () => Promise<void>;
  onNavigate: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return 'Started';
  if (diff < 3_600_000) return `In ${Math.round(diff / 60_000)} min`;
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function MeetupSheet({
  meetup,
  myCoords,
  profileId,
  isMember,
  isHost,
  onClose,
  onJoin,
  onLeave,
  onNavigate,
}: MeetupSheetProps) {
  const [busy, setBusy] = useState(false);
  const going = meetup.member_count ?? meetup.members?.length ?? 1;
  const { data: intel, isLoading: intelLoading } = useLocationIntel({
    latitude: meetup.dest_latitude,
    longitude: meetup.dest_longitude,
    placeName: meetup.dest_label || meetup.title,
  });

  const handleJoinLeave = async () => {
    if (!profileId) {
      toast.error('Sign in to join meetups');
      return;
    }
    setBusy(true);
    try {
      if (isMember && !isHost) {
        await onLeave();
        toast.success('Left meetup');
      } else if (!isMember) {
        await onJoin();
        toast.success("You're going!");
      }
    } catch {
      toast.error('Could not update RSVP');
    } finally {
      setBusy(false);
    }
  };

  const distanceLabel = (() => {
    if (!myCoords) return null;
    const d = Math.hypot(
      (meetup.dest_latitude - myCoords[0]) * 111_000,
      (meetup.dest_longitude - myCoords[1]) * 85_000,
    );
    if (d < 1000) return `${Math.round(d)} m away`;
    return `${(d / 1000).toFixed(1)} km away`;
  })();

  return (
    <MapLiquidSheet
      onClose={onClose}
      title={
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 mb-2">
            <Users className="h-3 w-3" /> Meetup
          </span>
          <h2 className="text-xl font-bold text-foreground">{meetup.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {meetup.dest_label || 'Destination'} · {formatWhen(meetup.starts_at)}
          </p>
          {distanceLabel && (
            <p className="text-xs text-primary mt-1">{distanceLabel}</p>
          )}
        </div>
      }
    >
      {meetup.description && (
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">{meetup.description}</p>
      )}

      <div className="flex items-center gap-2 p-3 rounded-xl liquid-glass-subtle border border-border/40 mb-4">
        <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {meetup.dest_label || `${meetup.dest_latitude.toFixed(4)}, ${meetup.dest_longitude.toFixed(4)}`}
          </p>
          <p className="text-[10px] text-muted-foreground">{going} going</p>
        </div>
      </div>

      <LocationIntelPanel intel={intel} loading={intelLoading} compact className="mb-4" />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onNavigate}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary font-bold text-primary-foreground"
        >
          <Navigation className="h-4 w-4" /> Live route
        </button>
        {!isHost && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleJoinLeave()}
            className={cn(
              'flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold',
              isMember
                ? 'bg-card/50 text-foreground border border-border/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
            )}
          >
            {isMember ? (
              <><LogOut className="h-4 w-4" /> Leave</>
            ) : (
              <><Check className="h-4 w-4" /> Join</>
            )}
          </button>
        )}
      </div>
    </MapLiquidSheet>
  );
}

interface MeetupCreateSheetProps {
  coords: [number, number];
  onClose: () => void;
  onSubmit: (input: { title: string; description?: string }) => Promise<void>;
}

export function MeetupCreateSheet({ coords, onClose, onSubmit }: MeetupCreateSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false);
  const { data: intel, isLoading: intelLoading } = useLocationIntel({
    latitude: coords[0],
    longitude: coords[1],
    placeName: title.trim() || undefined,
  });
  const needsAck = intel?.verdict === 'avoid' && !acknowledgedRisk;

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      toast.error('Add a meetup title');
      return;
    }
    if (needsAck) {
      toast.error('Review area warnings before creating this meetup');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ title: t, description: description.trim() || undefined });
      toast.success('Meetup created!');
      onClose();
    } catch {
      toast.error('Could not create meetup');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MapLiquidSheet
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-foreground">Plan a meetup here</h2>
        </div>
      }
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What's the plan?"
        maxLength={80}
        className="w-full h-11 rounded-xl bg-card/50 border border-border/50 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none mb-2"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional details…"
        maxLength={280}
        rows={2}
        className="w-full rounded-xl bg-card/50 border border-border/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none mb-4"
      />
      <p className="text-[10px] text-muted-foreground mb-3">
        Pin: {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
      </p>

      <LocationIntelPanel intel={intel} loading={intelLoading} compact className="mb-3" />

      {intel?.verdict === 'avoid' && (
        <label className="flex items-start gap-2 mb-3 p-2.5 rounded-xl bg-red-500/10 border border-red-400/25 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledgedRisk}
            onChange={(e) => setAcknowledgedRisk(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-[11px] text-red-200 leading-snug">
            I understand this area may be private, restricted, or unsafe — I&apos;ll meet somewhere public instead if needed.
          </span>
        </label>
      )}

      <button
        type="button"
        disabled={busy || needsAck}
        onClick={() => void submit()}
        className="w-full py-3 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50"
      >
        Create meetup
      </button>
    </MapLiquidSheet>
  );
}
