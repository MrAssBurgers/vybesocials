import { lazy, Suspense, useState } from 'react';
const BirthdayReview = lazy(() => import('./DiscoveryBirthdayReview'));

export function DiscoveryReadStatus({ error, ageReviewRequired, isLoading, retry }: {
  error?: unknown; ageReviewRequired?: boolean; isLoading?: boolean; retry: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (error) return <div role="alert" className="rounded-xl border border-border/50 bg-card/50 p-4 text-sm space-y-2">
    <p>Suggestions couldn’t load. Check your connection and try again.</p>
    <button type="button" onClick={retry} className="font-semibold text-primary">Retry suggestions</button>
  </div>;
  if (ageReviewRequired) return <div className="rounded-xl border border-border/50 bg-card/50 p-4 text-sm space-y-2">
    <p>Review your birthday to find people near your age. Your birthday stays private.</p>
    <button type="button" onClick={() => setOpen(true)} className="font-semibold text-primary">Review birthday</button>
    {open && <Suspense fallback={<p role="status">Opening birthday review…</p>}><BirthdayReview onClose={() => setOpen(false)} onSaved={() => { setOpen(false); retry(); }} /></Suspense>}
  </div>;
  if (isLoading) return <p role="status" className="p-4 text-sm text-muted-foreground">Loading suggestions…</p>;
  return null;
}
