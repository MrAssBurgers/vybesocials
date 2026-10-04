import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { useApproximateLocation } from '@/hooks/useApproximateLocation';
import { managePostLocalArea, type PostLocalReceipt } from '@/lib/postLocalAreaService';

export function PostLocalAreaDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const account = useProfileAccount();
  const location = useApproximateLocation(true);
  const queryClient = useQueryClient();
  const key = `${account.session.uid}:${account.session.epoch}:${account.profile?.id}:${postId}`;
  const current = useRef(key); current.current = key;
  const mounted = useRef(false);
  const [receipt, setReceipt] = useState<PostLocalReceipt | null>(null);
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = () => { account.guard(); if (!mounted.current || current.current !== key) throw new Error('Reopen this post.'); };
  const actor = { expectedOwnerUid: account.user?.id ?? '', expectedProfileId: account.profile?.id ?? '', postId };
  useEffect(() => {
    mounted.current = true; let cancelled = false; setReceipt(null); setReceiptKey(null); setError(null); setBusy(false);
    if (account.ready) void managePostLocalArea({ ...actor, action: 'state' }, guard).then(result => { if (!cancelled) { setReceiptKey(key); setReceipt(result); } })
      .catch(() => { if (!cancelled) setError('Local sharing could not be loaded. Close and reopen this post to retry.'); });
    return () => { cancelled = true; mounted.current = false; };
    // Each account/post generation owns its request and discards older receipts.
  }, [key, account.ready]);
  const validReceipt = receiptKey === key && receipt?.ownerUid === account.user?.id && receipt?.profileId === account.profile?.id && receipt?.postId === postId ? receipt : null;
  const save = async (action: 'share' | 'remove') => {
    if (busy || !validReceipt || (action === 'share' && !location.location)) return;
    setBusy(true); setError(null);
    try {
      const result = await managePostLocalArea({ ...actor, revision: validReceipt.revision,
        ...(action === 'share' ? { action, area: location.location! } : { action }) }, guard);
      setReceiptKey(key); setReceipt(result); location.clearLocation();
      void queryClient.invalidateQueries({ queryKey: ['social-feed'] });
    } catch (reason) {
      if (mounted.current && current.current === key) { setReceipt(null); setError(reason instanceof Error ? reason.message : 'This change could not be confirmed. Reopen this post.'); }
    } finally { if (mounted.current && current.current === key) setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="rounded-[2rem]">
    <DialogHeader><DialogTitle>Share a little closer</DialogTitle><DialogDescription>Let people nearby discover this post. Its existing audience and privacy settings still apply.</DialogDescription></DialogHeader>
    <p className="text-sm text-muted-foreground">Only a rounded area is sent and saved for this post. Exact GPS coordinates stay on your device. Nearby means about 25 miles from that area.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {validReceipt ? <>
      <p role="status" className="font-medium">{validReceipt.enabled ? 'This post is shared to Local.' : 'This post is not shared to Local.'}</p>
      <p className="text-xs text-muted-foreground">Sharing stays on until you remove it here. You can remove it without giving location access again.</p>
      {location.error && <p role="alert" className="text-sm text-destructive">{location.error}</p>}
      {location.location ? <Button className="rounded-full" disabled={busy} onClick={() => void save('share')}>{busy ? 'Saving…' : validReceipt.enabled ? 'Use this area for the post' : 'Share this post to Local'}</Button>
        : <Button className="rounded-full" disabled={busy || location.pending} onClick={location.requestLocation}>{location.pending ? 'Finding your area…' : validReceipt.enabled ? 'Choose a new approximate area' : 'Choose my approximate area'}</Button>}
      {validReceipt.enabled && <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => void save('remove')}>Remove from Local</Button>}
    </> : !error && <p role="status" className="text-sm text-muted-foreground">Checking Local sharing…</p>}
  </DialogContent></Dialog>;
}
