import { useEffect, useId, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCommunitySession } from '@/hooks/useCommunitySession';
import { communityAccountLease } from '@/lib/communityService';
import { sendCommunityAttachment, validateCommunityAttachment, type CommunityAttachmentDraft } from '@/lib/communityAttachmentService';

export function CommunityAttachmentComposer({ channelId, disabled }: { channelId: string; disabled: boolean }) {
  const { session, ready } = useCommunitySession();
  return ready ? <AttachmentComposerSession key={`${channelId}:${session.uid}:${session.epoch}`} channelId={channelId} disabled={disabled} /> : null;
}
function AttachmentComposerSession({ channelId, disabled }: { channelId: string; disabled: boolean }) {
  const { session } = useCommunitySession(); const queryClient = useQueryClient(); const inputId = useId();
  const [open, setOpen] = useState(false), [file, setFile] = useState<File | null>(null), [content, setContent] = useState('');
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const draft = useRef<CommunityAttachmentDraft | null>(null), active = useRef<AbortController | null>(null), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); }; }, []);
  useEffect(() => { if (disabled) { active.current?.abort(); setOpen(false); } }, [disabled]);
  const reset = () => { draft.current = null; setFile(null); setContent(''); setError(null); setProgress(0); };
  const send = async () => {
    if (!file || active.current || disabled) return;
    const lease = communityAccountLease(session.uid, session), controller = new AbortController();
    const guard = () => { lease(); if (!alive.current || controller.signal.aborted) throw new Error('This upload view closed.'); };
    active.current = controller; setBusy(true); setError(null); setNotice(null);
    try {
      guard(); draft.current ??= { requestId: crypto.randomUUID(), channelId, content, file, session };
      await sendCommunityAttachment(draft.current, controller.signal, setProgress, guard); guard();
      void queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] });
      reset(); setOpen(false); setNotice('Private attachment sent.');
    } catch (cause) {
      try { guard(); } catch { return; }
      setError(cause instanceof Error ? cause.message : 'Attachment was not confirmed. Retry the same upload.');
    } finally { if (active.current === controller) active.current = null; if (alive.current) setBusy(false); }
  };
  return <div className="mb-2 space-y-2">
    <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => { setOpen(value => !value); setNotice(null); }}><Paperclip className="mr-2 h-4 w-4" />{open ? 'Hide attachment' : 'Attach file'}</Button>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {open && <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <label htmlFor={inputId} className="block text-sm font-medium">Private channel attachment</label>
      <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" disabled={busy || !!draft.current} className="block w-full min-h-11 text-sm"
        onChange={event => { const next = event.target.files?.[0]; if (!next) return; try { validateCommunityAttachment(next); setFile(next); setError(null); } catch (error) { setFile(null); setError((error as Error).message); } }} />
      <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, MP4 or WebM • up to 20 MiB. Current channel access is required to open new attachments.</p>
      {file && <p className="break-all text-xs">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MiB)</p>}
      <Input aria-label="Attachment message" placeholder="Add a message (optional)" maxLength={8000} disabled={busy || !!draft.current} value={content} onChange={event => setContent(event.target.value)} />
      {busy && <p role="status" className="text-sm">{progress < 100 ? 'Uploading private attachment…' : 'Confirming private attachment…'}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {draft.current && !busy && <p className="text-xs text-muted-foreground">Retry keeps the same file and message. A new upload starts a separate attachment.</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!file || busy || disabled} onClick={() => void send()}>{busy ? 'Sending…' : draft.current ? 'Retry attachment' : 'Send attachment'}</Button>
        {draft.current && !busy && <Button type="button" variant="outline" onClick={reset}>Start new upload</Button>}</div>
    </div>}
  </div>;
}
