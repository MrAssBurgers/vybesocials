import { memo, useEffect, useRef, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocationShareWithFriend } from '@/hooks/useLocationShareWithFriend';
import type { LocationDuration, LocationRequest } from '@/lib/locationSharingService';

export type FriendLocationController = ReturnType<typeof useLocationShareWithFriend>;
export const locationDurationLabel = (duration: LocationDuration) => ({ once: '15 minutes', '1h': '1 hour', until_tonight: 'until midnight UTC', '24h': '24 hours', while_using: 'while using the map (up to 4 hours)', indefinite: 'up to 1 year', custom: 'the requested duration' }[duration]);

interface FriendMapSectionProps {
  otherProfileId: string;
  otherUsername?: string;
  canViewLocation?: boolean;
  onRequestLocation: () => void;
  className?: string;
}

export const FriendMapSection = memo(function FriendMapSection(props: FriendMapSectionProps) {
  const location = useLocationShareWithFriend(props.otherProfileId);
  return <FriendLocationPanel key={JSON.stringify([location.actor.uid, location.actor.profileId, location.actor.epoch, props.otherProfileId])} {...props} location={location} />;
});

/** Shared with the chat sheet so its controls use one read and mutation lock. */
export function FriendLocationPanel({ location, otherUsername, canViewLocation = true, onRequestLocation, className }: Omit<FriendMapSectionProps, 'otherProfileId'> & { location: FriendLocationController }) {
  const [error, setError] = useState('');
  const [blockRequest, setBlockRequest] = useState<LocationRequest | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const pending = saving || location.requestShare.isPending;
  const run = async (operation: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      location.guardCurrent(); await operation(); location.guardCurrent();
      if (active.current) setBlockRequest(null);
    } catch (failure) {
      if (!active.current) return;
      try { location.guardCurrent(); } catch { return; }
      setError(failure instanceof Error ? failure.message : 'This change was not confirmed. Please retry.');
    } finally { busy.current = false; if (active.current) setSaving(false); }
  };
  if (location.isError) return <div className={cn('space-y-3 rounded-2xl border p-4', className)} role="alert"><p>Location sharing could not be checked.</p><Button variant="secondary" onClick={() => void location.refetch()}>Retry location sharing</Button></div>;
  if (!location.data || !location.isReady) return <div className={cn('rounded-2xl border p-4 text-sm text-muted-foreground', className)} role="status">Checking location sharing…</div>;
  const { outgoingShare, incomingShare } = location;
  const sample = canViewLocation ? location.location : undefined;
  const respond = (request: LocationRequest, intent: 'accept' | 'decline' | 'block') => run(() => location.respondRequest.mutateAsync({ request, intent }));

  return <section className={cn('overflow-hidden rounded-2xl border border-white/10 bg-card/40', className)} aria-label="Location sharing status">
    <div className="flex min-h-28 items-center justify-center bg-gradient-to-br from-violet-950/40 via-background to-cyan-950/30 px-4 py-5 text-center">
      <div>{sample ? <MapPin className="mx-auto mb-2 h-7 w-7 text-primary" /> : <Navigation className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />}
        <p className="text-sm">{sample ? `${sample.precision === 'approximate' ? 'Approximate' : 'Precise'} location available on VybeMap` : canViewLocation ? `No current location from @${otherUsername || 'friend'}` : 'Location hidden by privacy settings'}</p>
        {sample && <p className="mt-1 text-xs text-muted-foreground">Updated {new Date(sample.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>}
      </div>
    </div>
    <div className="space-y-3 p-3 text-sm">
      {location.data.legacySharingNeedsReview && <p className="rounded-lg bg-muted p-3">Older location permissions need a new request and acceptance before sharing again.</p>}
      {outgoingShare && <div className="space-y-2 rounded-xl border p-3">
        <p>{outgoingShare.paused ? 'Your location access is paused.' : 'This friend has permission to view your location.'}</p>
        <p className="text-xs text-muted-foreground">{outgoingShare.precision === 'precise' ? 'Precise' : 'Approximate'} · expires {new Date(outgoingShare.expiresAt).toLocaleString()}</p>
        {!location.data.state.enabled && <p className="text-xs text-muted-foreground">Live updates are off. Enable sharing on VybeMap to send your location.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => void run(() => location.pauseShare.mutateAsync(!outgoingShare.paused))}>{outgoingShare.paused ? 'Resume sharing' : 'Pause sharing'}</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => location.stopShare.mutateAsync(outgoingShare))}>Stop sharing</Button>
        </div>
      </div>}
      {incomingShare && <div className="space-y-2 rounded-xl border p-3">
        <p>{incomingShare.paused ? 'Your friend paused location access.' : 'You have permission to view this friend’s location.'}</p>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => location.stopShare.mutateAsync(incomingShare))}>Stop viewing</Button>
      </div>}
      {location.incomingRequests.map(request => <div key={request.id} className="space-y-2 rounded-xl border p-3">
        <p><strong>@{request.requester.username || 'friend'}</strong> wants to see your {request.precision} location for {locationDurationLabel(request.duration)}.</p>
        {request.message && <p className="whitespace-pre-wrap text-muted-foreground">{request.message}</p>}
        <p className="text-xs text-muted-foreground">Accepting grants access. Live updates are enabled separately on VybeMap.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => void respond(request, 'accept')}>Accept request</Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => void respond(request, 'decline')}>Decline request</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setBlockRequest(request)}>Block person</Button>
        </div>
        {blockRequest?.id === request.id && <div className="space-y-2" role="alert"><p>Block this person? This also stops location access in both directions.</p><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={pending} onClick={() => void respond(request, 'block')}>Confirm block</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => setBlockRequest(null)}>Cancel</Button></div></div>}
      </div>)}
      {location.outgoingRequests.map(request => <p key={request.id} className="rounded-xl bg-muted p-3">Request pending · {request.precision} · {locationDurationLabel(request.duration)}</p>)}
      {canViewLocation && !incomingShare && location.outgoingRequests.length === 0 && <Button size="sm" variant="secondary" className="w-full" disabled={pending} onClick={onRequestLocation}>Request location</Button>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </section>;
}
