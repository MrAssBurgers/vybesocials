import { useState } from 'react';
import { useMapSocialMutation, useMapViewGuard } from '@/hooks/vybemap/useMapSocial';

export function MapLegacyReview({ kind, id, revision }: { kind: 'place' | 'meetup'; id: string; revision: string }) {
  const [reviewing, setReviewing] = useState(false), [error, setError] = useState('');
  const mutation = useMapSocialMutation(`${kind}:${id}:publish`);
  const view = useMapViewGuard(`${kind}:${id}:review`);
  const publish = async () => {
    try {
      view.guard(); setError('');
      await mutation.mutateAsync({ action: kind === 'place' ? 'publishPlace' : 'publishMeetup', targetId: id, expectedRevision: revision });
      view.guard(); setReviewing(false);
    } catch { try { view.guard(); setError('Sharing could not be confirmed. Refresh this item and retry.'); } catch { /* Closed view. */ } }
  };
  return <div className="rounded-2xl border border-primary/25 p-4 my-3 text-sm">
    <p>Only you can see this older {kind === 'place' ? 'spot' : 'meetup'}.</p>
    {reviewing ? <><p className="text-muted-foreground mt-2">Share the name, details and exact map location shown here with your friends? Older activity counts will start fresh.</p><button type="button" disabled={mutation.isPending} onClick={() => void publish()} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 mt-3">{mutation.isPending ? 'Sharing…' : 'Share with friends'}</button><button type="button" disabled={mutation.isPending} onClick={() => setReviewing(false)} className="px-4 py-2">Cancel</button></> : <button type="button" onClick={() => setReviewing(true)} className="text-primary underline mt-2">Review and share</button>}
    {error && <p role="alert" className="mt-2">{error}</p>}
  </div>;
}
