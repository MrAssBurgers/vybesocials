import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Loader2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth';
import { useCreatePost } from '@/hooks/usePosts';
import { completeGameCapture, discardGameCapture, downloadGameCapture, getGameCapture, type CaptureReceipt } from '@/lib/gameCaptureService';

export default function GameCapture() {
  const { captureId = '' } = useParams();
  const { user } = useAuth();
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
  const [retry, setRetry] = useState(0);
  const actionLock = useRef(false);
  const operationKey = `${user?.id ?? ''}:${captureId}`;
  const activeOperationKey = useRef(operationKey);
  activeOperationKey.current = operationKey;

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    actionLock.current = false; setBusy(false);
    setLoading(true); setError(''); setCapture(null); setFile(null); setPreview(''); setPublishedPostId(''); setDiscarded(false);
    const load = async () => {
      try {
        if (!/^[a-f0-9]{48}$/.test(captureId)) throw new Error('This capture link is invalid. Open a fresh link from your game.');
        const result = await getGameCapture(captureId);
        if (!active) return;
        setCapture(result); setCaption(result.caption);
        if (result.status === 'imported' && result.postId) { setPublishedPostId(result.postId); return; }
        if (result.status !== 'ready') throw new Error('This capture is not ready. Finish the upload in your game, then retry.');
        const media = await downloadGameCapture(result);
        if (!active) return;
        objectUrl = URL.createObjectURL(media);
        setFile(media); setPreview(objectUrl);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load this capture.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [captureId, user?.id, retry]);

  const publish = async () => {
    if (!file || !capture || actionLock.current || publishedPostId) return;
    const startedFor = activeOperationKey.current;
    actionLock.current = true; setBusy(true); setError('');
    try {
      const post = await createPost.mutateAsync({
        type: file.type.startsWith('video/') ? 'video' : 'post',
        mediaFile: file, caption, tags: capture.tags, gameCaptureId: captureId,
      });
      // Account/route changes invalidate pending UI work. Firestore independently
      // checks the current auth UID against the capture owner at commit time.
      if (activeOperationKey.current !== startedFor) return;
      // Show success as soon as the post exists. An acknowledgement failure must
      // never leave a publish button that duplicates an already-created post.
      setPublishedPostId(post.id);
      try { await completeGameCapture(captureId, post.id); }
      catch { if (activeOperationKey.current === startedFor) setError('Your post is live. The game receipt could not sync; do not upload this capture again.'); }
    } catch (cause) {
      if (activeOperationKey.current === startedFor) setError(cause instanceof Error ? cause.message : 'Could not publish. Your private capture is still available.');
    } finally { if (activeOperationKey.current === startedFor) { actionLock.current = false; setBusy(false); } }
  };

  const discard = async () => {
    if (actionLock.current) return;
    const startedFor = activeOperationKey.current;
    actionLock.current = true; setBusy(true); setError('');
    try { await discardGameCapture(captureId); if (activeOperationKey.current === startedFor) { setDiscarded(true); setFile(null); } }
    catch (cause) { if (activeOperationKey.current === startedFor) setError(cause instanceof Error ? cause.message : 'Could not discard this capture.'); }
    finally { if (activeOperationKey.current === startedFor) { actionLock.current = false; setBusy(false); } }
  };

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
        {publishedPostId ? <div className="space-y-4"><h2 className="text-xl font-semibold">Your moment is live</h2><p className="text-sm text-muted-foreground">Your capture is now on VYBE.</p><Button asChild><Link to={`/p/${publishedPostId}`}>View your post</Link></Button></div>
          : discarded ? <p role="status">Capture discarded. You can head back to your game.</p>
            : !loading && file && preview ? <>
              <div className="overflow-hidden rounded-2xl bg-black">
                {file.type.startsWith('video/') ? <video src={preview} controls playsInline preload="metadata" className="max-h-[55vh] w-full object-contain" /> : <img src={preview} alt={`Your capture from ${capture?.gameName}`} className="max-h-[55vh] w-full object-contain" />}
              </div>
              <div><label htmlFor="game-capture-caption" className="mb-2 block text-sm font-medium">Add your caption</label><Textarea id="game-capture-caption" value={caption} onChange={event => setCaption(event.target.value)} maxLength={2200} disabled={busy} placeholder="What happened in this moment?" className="min-h-28" /><p className="mt-1 text-right text-xs text-muted-foreground">{caption.length}/2200</p></div>
              {!!capture?.tags.length && <p className="text-sm text-primary">{capture.tags.map(tag => `#${tag}`).join(' ')}</p>}
              <p className="flex gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Your capture stays private until you publish it to the VYBE feed. VYBE checks it before sharing. Unpublished captures expire after 24 hours.</p>
              <div className="flex flex-wrap gap-3"><Button onClick={() => void publish()} disabled={busy} className="flex-1 gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Upload className="h-4 w-4" />} {busy ? 'Please wait…' : 'Publish to VYBE'}</Button><Button variant="outline" onClick={() => void discard()} disabled={busy} className="gap-2"><Trash2 className="h-4 w-4" /> Discard</Button></div>
            </> : !loading && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button>}
      </div>
    </section>
  </main>;
}
