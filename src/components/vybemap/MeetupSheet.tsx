import { useState } from 'react';
import { motion } from 'framer-motion';
import { Navigation, Users, MapPin, X, Plus, LogOut, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { MapMeetup } from '@/lib/vybemap/types';
import { useLocationIntel } from '@/hooks/vybemap/useLocationIntel';
import { LocationIntelPanel } from '@/components/vybemap/LocationIntelPanel';
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
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[2001] rounded-t-3xl bg-black/95 border-t border-white/10 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 mb-2">
              <Users className="h-3 w-3" /> Meetup
            </span>
            <h2 className="text-xl font-bold text-white">{meetup.title}</h2>
            <p className="text-sm text-white/50 mt-0.5">
              {meetup.dest_label || 'Destination'} · {formatWhen(meetup.starts_at)}
            </p>
            {distanceLabel && (
              <p className="text-xs text-primary mt-1">{distanceLabel}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {meetup.description && (
          <p className="text-sm text-white/70 leading-relaxed mb-4">{meetup.description}</p>
        )}

        <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/8 mb-4">
          <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">
              {meetup.dest_label || `${meetup.dest_latitude.toFixed(4)}, ${meetup.dest_longitude.toFixed(4)}`}
            </p>
            <p className="text-[10px] text-white/40">{going} going</p>
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
                  ? 'bg-white/10 text-white'
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
      </motion.div>
    </>
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
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="fixed inset-x-0 bottom-0 z-[2001] rounded-t-3xl bg-black/95 border-t border-white/10 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-2 mb-4">
          <Plus className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">Plan a meetup here</h2>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's the plan?"
          maxLength={80}
          className="w-full h-11 rounded-xl bg-white/8 border border-white/10 px-3 text-sm text-white placeholder:text-white/35 outline-none mb-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional details…"
          maxLength={280}
          rows={2}
          className="w-full rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none resize-none mb-4"
        />
        <p className="text-[10px] text-white/35 mb-3">
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
      </motion.div>
    </>
  );
}
