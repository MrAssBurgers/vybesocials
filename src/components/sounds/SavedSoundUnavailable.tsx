import { Button } from '@/components/ui/button';
import { useSaveSound } from '@/hooks/useSounds';
import type { SavedSoundEntry } from '@/lib/savedSoundService';
export function SavedSoundUnavailable({ entry }: { entry: SavedSoundEntry }) {
  const { unsaveSound, removeLegacy, pending, error } = useSaveSound();
  return <div className="rounded-lg border p-4 space-y-2"><p className="font-medium">{entry.legacy ? 'Previous saved reference' : 'Sound unavailable'}</p><p className="text-sm text-muted-foreground">{entry.legacy ? 'This older reference cannot be verified. Browse sounds to save the recording again, or remove this reference.' : 'This recording cannot be played here now. You can remove its saved reference.'}</p><Button variant="outline" disabled={pending} onClick={() => void (entry.legacy ? removeLegacy(entry.referenceId) : unsaveSound(entry.soundId!))}>{pending ? 'Removing reference' : 'Remove reference'}</Button>{error && <p role="alert">{error}</p>}</div>;
}
