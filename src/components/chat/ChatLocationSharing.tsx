import { useSearchParams } from 'react-router-dom';
import { LocationRequestSheet } from '@/components/friend-profile/LocationRequestSheet';

/** Consume the inbox's existing location deep link only for a loaded DM peer. */
export function ChatLocationSharing({ otherProfileId, otherUsername, available }: { otherProfileId?: string; otherUsername?: string; available: boolean }) {
  const [params, setParams] = useSearchParams();
  if (!available || !otherProfileId || params.get('location') !== '1') return null;
  return <LocationRequestSheet key={otherProfileId} open otherProfileId={otherProfileId} otherUsername={otherUsername} onOpenChange={open => {
    if (!open) setParams(current => { const next = new URLSearchParams(current); next.delete('location'); return next; }, { replace: true });
  }} />;
}
