import { useState, useRef } from 'react';
import { MapPin, Camera, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { useLocationIntel } from '@/hooks/vybemap/useLocationIntel';
import { LocationIntelPanel } from '@/components/vybemap/LocationIntelPanel';
import { useMapViewGuard } from '@/hooks/vybemap/useMapSocial';
import { MapLiquidSheet } from '@/components/vybemap/MapLiquidSheet';
import { validPostMediaUrl } from '@/lib/postMediaUrl';

const CATEGORIES = [
  { id: 'hangout', label: 'Hangout', emoji: '🔥' },
  { id: 'food', label: 'Food', emoji: '🍕' },
  { id: 'view', label: 'View', emoji: '🌅' },
  { id: 'study', label: 'Study', emoji: '📚' },
  { id: 'party', label: 'Party', emoji: '🎉' },
  { id: 'chill', label: 'Chill', emoji: '☕' },
] as const;

interface SpotDropSheetProps {
  coords: [number, number];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    category: string;
    description?: string;
    photo_url?: string;
    vibe_tags: string[];
  }) => Promise<void>;
}

export function SpotDropSheet({ coords, onClose, onSubmit }: SpotDropSheetProps) {
  const view = useMapViewGuard(`spot:${coords.join(':')}`);
  const pending = useRef(false), photoSequence = useRef(0), photoPending = useRef(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('hangout');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: intel, isLoading: intelLoading } = useLocationIntel({
    latitude: coords[0],
    longitude: coords[1],
    placeName: name.trim() || undefined,
    enabled: name.trim().length >= 2,
  });
  const needsAck = intel?.verdict === 'avoid' && !acknowledgedRisk;

  const handlePhoto = async (file: File) => {
    if (pending.current || photoPending.current) return;
    const sequence = ++photoSequence.current;
    const guard = () => { view.guard(); if (sequence !== photoSequence.current) throw new Error('Photo selection changed.'); };
    try {
      guard(); photoPending.current = true; setPhotoUploading(true); setError('');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Choose a nonempty JPEG, PNG or WebP photo smaller than 10 MB.');
      const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.slice(6);
      const path = `${view.account.user!.id}/map-spots/${crypto.randomUUID()}.${ext}`;
      const bucket = db.storage.from('media');
      const { data, error } = await bucket.upload(path, file); guard();
      if (error) throw error;
      if (data?.path !== path) throw new Error('Photo upload could not be confirmed. Choose it again to retry.');
      const resolved = await bucket.createSignedUrl(path); guard();
      if (resolved.error || !resolved.data?.signedUrl || !validPostMediaUrl(resolved.data.signedUrl)) throw new Error('The photo could not be opened. Choose it again to retry.');
      setPhotoUrl(resolved.data.signedUrl);
    } catch (error) { try { guard(); setError(error instanceof Error ? error.message : 'Could not upload photo. Choose it again to retry.'); } catch { /* Retired selection. */ } }
    finally { if (sequence === photoSequence.current) photoPending.current = false; try { guard(); setPhotoUploading(false); } catch { /* Retired selection. */ } }
  };

  const handlePublish = async () => {
    if (pending.current || photoPending.current) return;
    try { view.guard(); } catch { return; }
    if (!name.trim()) {
      toast.error('Give this spot a name');
      return;
    }
    if (needsAck) {
      toast.error('This area may be private or restricted — review warnings first');
      return;
    }
    pending.current = true; setUploading(true); setError('');
    try {
      await onSubmit({
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        photo_url: photoUrl ?? undefined,
        vibe_tags: [category],
      });
      view.guard(); toast.success('Spot shared with friends');
      onClose();
    } catch (e: unknown) {
      try { view.guard(); setError(e instanceof Error ? e.message : 'Could not confirm this spot. Please retry.'); } catch { /* Closed view. */ }
    } finally {
      pending.current = false;
      try { view.guard(); setUploading(false); } catch { /* Closed view. */ }
    }
  };

  return (
    <MapLiquidSheet
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-orange-400" />
          <h3 className="text-lg font-bold text-foreground">Drop a Vibe Spot</h3>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        {coords[0].toFixed(4)}, {coords[1].toFixed(4)} — shared with friends, including this exact location
      </p>

      {error && <p role="alert" className="text-sm mb-3">{error}</p>}
      <input
        disabled={uploading}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Spot name — e.g. Rooftop sunset spot"
        maxLength={80}
        className="w-full h-12 rounded-xl bg-card/50 border border-border/50 px-4 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 mb-3"
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={uploading}
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-bold border transition-colors',
              category === c.id
                ? 'bg-orange-500/25 border-orange-400/50 text-orange-200'
                : 'bg-card/40 border-border/40 text-muted-foreground',
            )}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <textarea
        disabled={uploading}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Why is this a cool place to hang? (optional)"
        rows={3}
        maxLength={280}
        className="w-full rounded-xl bg-card/50 border border-border/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 mb-3 resize-none"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={uploading || photoUploading}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = '';
          if (f) void handlePhoto(f);
        }}
      />

      <button
        type="button"
        disabled={uploading || photoUploading}
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border/50 text-muted-foreground text-sm mb-4"
      >
        <Camera className="h-4 w-4" />
        {photoUploading ? 'Uploading photo…' : photoUrl ? 'Change photo' : 'Add a photo (optional)'}
      </button>
      {photoUrl && (
        <img src={photoUrl} alt="" className="w-full h-36 object-cover rounded-xl mb-4 ring-1 ring-border/30" />
      )}

      {name.trim().length >= 2 && (
        <LocationIntelPanel intel={intel} loading={intelLoading} compact className="mb-3" />
      )}

      {intel?.verdict === 'avoid' && (
        <label className="flex items-start gap-2 mb-3 p-2.5 rounded-xl bg-red-500/10 border border-red-400/25 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledgedRisk}
            onChange={(e) => setAcknowledgedRisk(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-[11px] text-red-200 leading-snug">
            This spot may be trespassing or private property — I confirm it&apos;s a legal public hangout.
          </span>
        </label>
      )}

      <button
        type="button"
        disabled={uploading || photoUploading || !name.trim() || needsAck}
        onClick={() => void handlePublish()}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 font-bold text-white disabled:opacity-50"
      >
        {uploading ? 'Dropping spot…' : 'Drop on VybeMap'}
      </button>
    </MapLiquidSheet>
  );
}
