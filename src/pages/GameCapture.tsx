import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Loader2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth';
import { useCreatePost } from '@/hooks/usePosts';
import { completeGameCapture, discardGameCapture, downloadGameCapture, getGameCapture, gameCaptureErrorMessage, type CaptureReceipt } from '@/lib/gameCaptureService';

export default function GameCapture() {
  const { captureId = '' } = useParams();
  const { user } = useAuth();
  // Each account/route visit gets a distinct lifetime, even for A → B → A.
  return <CaptureReview key={`${user?.id ?? ''}:${captureId}`} captureId={captureId} />;
}

function CaptureReview({ captureId }: { captureId: string }) {
  const createPost = useCreatePost();
  const [capture, setCapture] = useState<CaptureReceipt | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const [publishedPostId, setPublishedPostId] = useState('');
  const [needsSync, setNeedsSync] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [retry, setRetry] = useState(0);
  const actionLock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const objectUrl = URL.createObjectURL(file); setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  useEffect(() => {
    if (capture?.status !== 'ready' || publishedPostId || discarded) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [capture, publishedPostId, discarded]);

  useEffect(() => {
    let active = true;
    actionLock.current = false; setBusy(false);
    setLoading(true); setError(''); setCapture(null); setFile(null); setPublishedPostId(''); setDiscarded(false); setNeedsSync(false);
    const load = async () => {
      try {
        if (!/^[a-f0-9]{48}$/.test(captureId)) throw new Error('This capture link is invalid. Open a fresh link from your game.');
        const result = await getGameCapture(captureId);
        if (!active) return;
        setCapture(result); setCaption(result.caption);
        if (result.status === 'imported' && result.postId) { setPublishedPostId(result.postId); return; }
        if (result.status === 'cancelled') { setDiscarded(true); return; }
        if (result.status === 'expired' || result.expiresAt <= Date.now()) { setNow(Date.now()); return; }
        if (result.status !== 'ready') throw new Error('This capture is still uploading. Finish the upload in your game, then retry.');
        const media = await downloadGameCapture(result);
        if (!active) return;
        setFile(media);
      } catch (cause) {
        if (active) setError(gameCaptureErrorMessage(cause));
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [captureId, retry]);

  const showPublished = (postId: string) => { setPublishedPostId(postId); setFile(null); setNeedsSync(false); setError(''); };
  const recoverPublished = async () => {
    try {
      const current = await getGameCapture(captureId);
      if (mounted.current && current.status === 'imported' && current.postId) { showPublished(current.postId); return true; }
    } catch { /* Keep the original operation error if recovery is unavailable. */ }
    return false;
  };

  const publish = async () => {
    if (!file || !capture || actionLock.current || publishedPostId || capture.expiresAt <= Date.now()) { setNow(Date.now()); return; }
    actionLock.current = true; setBusy(true); setError('');
    try {
      const post = await createPost.mutateAsync({
        type: file.type.startsWith('video/') ? 'video' : 'post',
        mediaFile: file, caption, tags: capture.tags, gameCaptureId: captureId,
      });
      // Account/route changes invalidate pending UI work. Firestore independently
      // checks the current auth UID against the capture owner at commit time.
      if (!mounted.current) return;
      // Show success as soon as the post exists. An acknowledgement failure must
      // never leave a publish button that duplicates an already-created post.
      showPublished(post.id);
      try { await completeGameCapture(captureId, post.id); }
      catch { if (mounted.current) { setNeedsSync(true); setError('Your post is live. The game receipt could not sync. Retry syncing below; this will not publish again.'); } }
    } catch (cause) {
      if (mounted.current && !await recoverPublished() && mounted.current) setError(gameCaptureErrorMessage(cause, 'Could not confirm publishing. Retry with this same capture.'));
    } finally { if (mounted.current) { actionLock.current = false; setBusy(false); } }
  };

  const discard = async () => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try { await discardGameCapture(captureId); if (mounted.current) { setDiscarded(true); setFile(null); } }
    catch (cause) { if (mounted.current && !await recoverPublished() && mounted.current) setError(gameCaptureErrorMessage(cause, 'Could not confirm discard. Try again.')); }
    finally { if (mounted.current) { actionLock.current = false; setBusy(false); } }
  };

  const sync = async () => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true);
    try { if (!await recoverPublished() && mounted.current) setError('Your post is live. Receipt sync is still unavailable; try again later.'); }
    finally { if (mounted.current) { actionLock.current = false; setBusy(false); } }
  };
  const expired = capture && (capture.status === 'expired' || capture.expiresAt <= now);

  return <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:pt-10">
    <Link to="/home" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to VYBE</Link>
    <section className="overflow-hidden rounded-3xl border border-border bg-card/90 shadow-xl">
      <div className="border-b border-border bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-cyan-500/10 p-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Gamepad2 className="h-6 w-6" /></div>
        <h1 className="text-2xl font-bold tracking-tight">Your game. Your moment.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{capture ? `Captured in ${capture.gameName}. Review it before sharing with VYBE.` : 'Bring a screenshot or highlight from your game into VYBE.'}</p>
      </div>
      <div className="space-y-5 p-6">
        {loading && <div role="status" className="flex items-center gap-3 py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> Loading your private capture…</div>}
        {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>}
        {publishedPostId ? <div className="space-y-4"><h2 className="text-xl font-semibold">Your moment is live</h2><p className="text-sm text-muted-foreground">Your capture is now on VYBE.</p><div className="flex flex-wrap gap-3"><Button asChild><Link to={`/p/${publishedPostId}`}>View your post</Link></Button>{needsSync && <Button variant="outline" onClick={() => void sync()} disabled={busy}>{busy ? 'Syncing…' : 'Retry receipt sync'}</Button>}</div></div>
          : discarded ? <p role="status">Capture discarded. You can head back to your game.</p>
            : !loading && expired ? <div role="status" className="space-y-3"><h2 className="text-lg font-semibold">This capture has expired</h2><p className="text-sm text-muted-foreground">Create a new capture in your game. If you already published this one in another tab, check its status below.</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Check capture status</Button></div>
            : !loading && file && preview ? <>
              <div className="overflow-hidden rounded-2xl bg-black">
                {file.type.startsWith('video/') ? <video src={preview} controls playsInline preload="metadata" className="max-h-[55vh] w-full object-contain" /> : <img src={preview} alt={`Your capture from ${capture?.gameName}`} className="max-h-[55vh] w-full object-contain" />}
              </div>
              <div><label htmlFor="game-capture-caption" className="mb-2 block text-sm font-medium">Add your caption</label><Textarea id="game-capture-caption" value={caption} onChange={event => setCaption(event.target.value)} maxLength={2200} disabled={busy} placeholder="What happened in this moment?" className="min-h-28" /><p className="mt-1 text-right text-xs text-muted-foreground">{caption.length}/2200</p></div>
              {!!capture?.tags.length && <p className="text-sm text-primary">{capture.tags.map(tag => `#${tag}`).join(' ')}</p>}
              <p className="flex gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Your capture stays private until you publish it to the VYBE feed. VYBE checks it before sharing. This private capture expires {capture && new Date(capture.expiresAt).toLocaleString()}.</p>
              <div className="flex flex-wrap gap-3"><Button onClick={() => void publish()} disabled={busy} className="flex-1 gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Upload className="h-4 w-4" />} {busy ? 'Please wait…' : 'Publish to VYBE'}</Button><Button variant="outline" onClick={() => void discard()} disabled={busy} className="gap-2"><Trash2 className="h-4 w-4" /> Discard</Button></div>
            </> : !loading && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button>}
      </div>
    </section>
  </main>;
}
