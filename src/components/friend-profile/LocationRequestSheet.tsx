import { memo, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocationShareWithFriend } from '@/hooks/useLocationShareWithFriend';
import type { LocationDuration, LocationPrecision } from '@/lib/locationSharingService';
import { FriendLocationPanel, type FriendLocationController } from './FriendMapSection';

const DURATIONS: { value: LocationDuration; label: string }[] = [
  { value: 'once', label: '15 minutes' }, { value: '1h', label: '1 hour' },
  { value: 'until_tonight', label: 'Until midnight UTC' }, { value: '24h', label: '24 hours' },
  { value: 'while_using', label: 'While using the map (up to 4 hours)' },
];
interface LocationRequestSheetProps { open: boolean; onOpenChange: (open: boolean) => void; otherProfileId: string; otherUsername?: string }

export const LocationRequestSheet = memo(function LocationRequestSheet(props: LocationRequestSheetProps) {
  // Closing retires form state and pending continuations even when the route stays mounted.
  return props.open ? <OpenLocationSheet {...props} /> : null;
});
function OpenLocationSheet(props: LocationRequestSheetProps) {
  const location = useLocationShareWithFriend(props.otherProfileId);
  return <LocationSheetBody key={JSON.stringify([location.actor.uid, location.actor.profileId, location.actor.epoch, props.otherProfileId])} {...props} location={location} />;
}
function LocationSheetBody({ onOpenChange, otherUsername, location }: LocationRequestSheetProps & { location: FriendLocationController }) {
  const [requesting, setRequesting] = useState(false);
  const [duration, setDuration] = useState<LocationDuration>('1h');
  const [precision, setPrecision] = useState<LocationPrecision>('approximate');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const active = useRef(true), busy = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const pending = saving || location.requestShare.isPending;
  const send = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      location.guardCurrent();
      await location.requestShare.mutateAsync({ duration, precision, message: message.trim() || undefined });
      location.guardCurrent();
      if (active.current) { setRequesting(false); setMessage(''); }
    } catch (failure) {
      if (!active.current) return;
      try { location.guardCurrent(); } catch { return; }
      setError(failure instanceof Error ? failure.message : 'The request was not confirmed. Please retry.');
    } finally { busy.current = false; if (active.current) setSaving(false); }
  };
  return <Sheet open onOpenChange={onOpenChange}>
    <SheetContent side="bottom">
      <SheetHeader><SheetTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Location sharing</SheetTitle><SheetDescription>Manage location access with @{otherUsername || 'friend'}.</SheetDescription></SheetHeader>
      <div className="mt-4 space-y-4">
        <FriendLocationPanel location={location} otherUsername={otherUsername} onRequestLocation={() => setRequesting(true)} />
        {requesting && location.isReady && location.data && <form className="space-y-3 rounded-xl border p-3" onSubmit={event => { event.preventDefault(); void send(); }} aria-label="Request location">
          <p className="text-sm">Ask to see your friend’s location. This does not turn on your own location sharing.</p>
          <label className="block text-sm">Duration<select className="mt-1 block w-full rounded-lg border bg-background p-2" value={duration} onChange={event => setDuration(event.target.value as LocationDuration)} disabled={pending}>{DURATIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="block text-sm">Precision<select className="mt-1 block w-full rounded-lg border bg-background p-2" value={precision} onChange={event => setPrecision(event.target.value as LocationPrecision)} disabled={pending}><option value="approximate">Approximate area</option><option value="precise">Precise location</option></select></label>
          {duration === 'while_using' && <p className="text-xs text-muted-foreground">Updates need the map open and the app visible. This access stops showing a location after 30 seconds without a fresh sample.</p>}
          <Textarea aria-label="Optional request message" placeholder="Optional message…" value={message} onChange={event => setMessage(event.target.value)} rows={2} maxLength={200} disabled={pending} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send request'}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setRequesting(false)}>Cancel</Button></div>
        </form>}
        <Button asChild variant="outline" className="w-full"><Link to="/map" onClick={() => onOpenChange(false)}>Open VybeMap</Link></Button>
      </div>
    </SheetContent>
  </Sheet>;
}
