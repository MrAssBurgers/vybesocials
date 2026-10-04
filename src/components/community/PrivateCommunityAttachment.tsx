import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCommunitySession } from '@/hooks/useCommunitySession';
import { communityAccountLease, communityAccountSubscribe } from '@/lib/communityService';
import { fetchCommunityAttachment } from '@/lib/communityAttachmentService';

export function PrivateCommunityAttachment({ messageId, attachmentId, legacyUrl, mediaType }: { messageId: string; attachmentId?: string; legacyUrl?: string | null; mediaType?: string | null }) {
  const { session, ready } = useCommunitySession();
  if (!attachmentId) return legacyUrl ? <p className="mt-2 rounded-lg border border-border p-3 text-sm text-muted-foreground">This older attachment is unavailable in private viewing. Ask the sender to re-share it with Attach file.</p> : null;
  if (!ready) return null;
  return <PrivateMediaSession key={`${messageId}:${attachmentId}:${session.uid}:${session.epoch}`} messageId={messageId} mediaType={mediaType} />;
}

function PrivateMediaSession({ messageId, mediaType }: { messageId: string; mediaType?: string | null }) {
  const { session } = useCommunitySession();
  const [opened, setOpened] = useState(false), [url, setUrl] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const activeUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!opened) { setUrl(null); return; }
    const controller = new AbortController(); const lease = communityAccountLease(session.uid, session); let live = true, checking = false;
    const clear = () => { if (activeUrl.current) URL.revokeObjectURL(activeUrl.current); activeUrl.current = null; if (live) setUrl(null); };
    const fail = (cause: unknown) => { controller.abort(); clear(); if (live) setError(cause instanceof Error ? cause.message : 'Attachment unavailable.'); };
    const current = () => { lease(); if (!live || controller.signal.aborted) throw new Error('Attachment closed.'); };
    const stopAccount = communityAccountSubscribe(() => { try { current(); } catch { fail(new Error('Your account changed. Open this channel again.')); } });
    void fetchCommunityAttachment(messageId, session, controller.signal).then(blob => {
      current(); if (!blob) throw new Error('Attachment unavailable.');
      const value = URL.createObjectURL(blob); activeUrl.current = value; setUrl(value);
    }).catch(error => { if (live) fail(error); });
    const check = async () => {
      if (checking || controller.signal.aborted) return;
      checking = true;
      try { await fetchCommunityAttachment(messageId, session, controller.signal, true); current(); }
      catch (error) { if (live) fail(error); } finally { checking = false; }
    };
    const interval = window.setInterval(() => { void check(); }, 15_000);
    const resume = () => { void check(); };
    const visibility = () => { if (document.visibilityState === 'hidden') { controller.abort(); clear(); setOpened(false); } else void check(); };
    const hide = () => { controller.abort(); clear(); setOpened(false); };
    window.addEventListener('app-resumed', resume); window.addEventListener('pagehide', hide); document.addEventListener('visibilitychange', visibility);
    return () => { live = false; controller.abort(); stopAccount(); clearInterval(interval); clear(); window.removeEventListener('app-resumed', resume); window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', visibility); };
  }, [opened, messageId, session]);
  return <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : opened && !url ? <p role="status" className="text-sm">Opening private attachment…</p> : null}
    {opened && url && (mediaType === 'video' ? <video src={url} controls playsInline preload="metadata" className="max-h-96 max-w-full rounded-lg" /> : <img src={url} alt="Shared attachment" className="max-h-96 max-w-full rounded-lg object-contain" />)}
    <Button type="button" size="sm" variant="outline" onClick={() => { setError(null); setOpened(value => !value); }}>
      {opened ? 'Close attachment' : 'Open private attachment'}
    </Button>
    {error && opened && <p className="text-xs text-muted-foreground">Close and open again to retry.</p>}
  </div>;
}
