import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Camera, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { useLocationIntel } from '@/hooks/vybemap/useLocationIntel';
import { LocationIntelPanel } from '@/components/vybemap/LocationIntelPanel';

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
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `map-spots/${Date.now()}.${ext}`;
      const { error } = await db.storage.from('media').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = db.storage.from('media').getPublicUrl(path);
      setPhotoUrl(publicUrl);
    } catch {
      toast.error('Could not upload photo');
    }
  };

  const handlePublish = async () => {
    if (!name.trim()) {
      toast.error('Give this spot a name');
      return;
    }
    if (needsAck) {
      toast.error('This area may be private or restricted — review warnings first');
      return;
    }
    setUploading(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        photo_url: photoUrl ?? undefined,
        vibe_tags: [category],
      });
      toast.success('Spot dropped on VybeMap! 🔥');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not drop spot');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] bg-black/60"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="fixed inset-x-0 bottom-0 z-[2001] rounded-t-3xl bg-black/95 border-t border-white/10 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-400" />
            <h3 className="text-lg font-bold text-white">Drop a Vibe Spot</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full text-white/60">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-white/45 mb-4 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          {coords[0].toFixed(4)}, {coords[1].toFixed(4)} — friends can discover your hangout
        </p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Spot name — e.g. Rooftop sunset spot"
          maxLength={80}
          className="w-full h-12 rounded-xl bg-white/8 border border-white/10 px-4 text-white placeholder:text-white/35 outline-none focus:border-primary/50 mb-3"
        />

        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-bold border transition-colors',
                category === c.id
                  ? 'bg-orange-500/25 border-orange-400/50 text-orange-200'
                  : 'bg-white/5 border-white/10 text-white/60',
              )}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why is this a cool place to hang? (optional)"
          rows={3}
          maxLength={280}
          className="w-full rounded-xl bg-white/8 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-primary/50 mb-3 resize-none"
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handlePhoto(f);
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/20 text-white/70 text-sm mb-4"
        >
          <Camera className="h-4 w-4" />
          {photoUrl ? 'Change photo' : 'Add a photo (optional)'}
        </button>
        {photoUrl && (
          <img src={photoUrl} alt="" className="w-full h-36 object-cover rounded-xl mb-4 ring-1 ring-white/10" />
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
          disabled={uploading || !name.trim() || needsAck}
          onClick={() => void handlePublish()}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 font-bold text-white disabled:opacity-50"
        >
          {uploading ? 'Dropping spot…' : 'Drop on VybeMap'}
        </button>
      </motion.div>
    </>
  );
}
