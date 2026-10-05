import { useEffect, useState, useRef } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsSoundSaved, useSaveSound } from '@/hooks/useSounds';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { cn } from '@/lib/utils';

export function SaveSoundButton({ soundId, saved }: { soundId: string; saved?: boolean }) {
  const session = useReportAccountSession();
  return saved === undefined ? <CheckedSaveButton key={`${session.uid}:${session.epoch}:${soundId}`} soundId={soundId} /> : <SaveControl key={`${session.uid}:${session.epoch}:${soundId}`} soundId={soundId} saved={saved} />;
}
function CheckedSaveButton({ soundId }: { soundId: string }) {
  const query = useIsSoundSaved(soundId);
  if (query.isError) return <div onClick={event => event.stopPropagation()}><span role="alert" className="text-xs">Saved status unavailable.</span><Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry saved status</Button></div>;
  if (query.data === undefined) return <Button disabled size="sm" variant="outline">Loading saved status</Button>;
  return <SaveControl soundId={soundId} saved={query.data} />;
}
function SaveControl({ soundId, saved }: { soundId: string; saved: boolean }) {
  const { saveSound, unsaveSound, pending, error } = useSaveSound();
  const session = useReportAccountSession();
  const live = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [confirmed, setConfirmed] = useState(saved);
  useEffect(() => { setConfirmed(saved); }, [saved]);
  return <div onClick={event => event.stopPropagation()}><Button size="sm" variant={confirmed ? 'secondary' : 'outline'} aria-pressed={confirmed} disabled={pending} onClick={async () => {
    const result = await (confirmed ? unsaveSound(soundId) : saveSound(soundId));
    const now = reportAccountSnapshot();
    if (result !== null && live.current && now.uid === session.uid && now.epoch === session.epoch) setConfirmed(result);
  }}><Heart className={cn('h-4 w-4 mr-1', confirmed && 'fill-current')} />{pending ? 'Updating saved sound' : confirmed ? 'Remove saved sound' : 'Save sound'}</Button>{error && <p role="alert" className="text-xs mt-1">{error}</p>}</div>;
}
