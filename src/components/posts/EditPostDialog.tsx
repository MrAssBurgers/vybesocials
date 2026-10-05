import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { usePostMutations } from '@/hooks/usePostMutations';
import type { PostMutationState } from '@/lib/postMutationService';

interface EditPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: { id: string; caption: string; tags: string[] };
}

export function EditPostDialog({ open, onOpenChange, post }: EditPostDialogProps) {
  const { read, mutate, guard, ready, isPending } = usePostMutations(`${post.id}:${open}`);
  const [state, setState] = useState<PostMutationState | null>(null);
  const [stateReader, setStateReader] = useState<typeof read | null>(null);
  const [caption, setCaption] = useState(''), [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(''); setState(null);
    try {
      const value = await read(post.id); guard();
      if (!value.post || !value.revision) throw new Error('This post is no longer available.');
      setState(value); setStateReader(() => read); setCaption(value.post.caption); setTagsInput(value.post.tags.join(', '));
    } catch (failure) { try { guard(); setError(failure instanceof Error ? failure.message : 'This post could not be loaded.'); } catch { /* Retired dialog. */ } }
    finally { try { guard(); setLoading(false); } catch { /* Retired dialog. */ } }
  }, [read, guard, post.id]);
  useEffect(() => { setCaption(''); setTagsInput(''); setState(null); if (open && ready) void load(); }, [open, ready, load]);

  const save = async () => {
    if (stateReader !== read || !state?.post || !state.revision || isPending) return;
    const tags = tagsInput.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean);
    setError('');
    try {
      const { postPayloadFromState } = await import('@/lib/postMutationService'); guard();
      const result = await mutate(state.needsOwnerConfirmation
        ? { action: 'recover', postId: post.id, expectedRevision: state.revision, payload: { ...postPayloadFromState(state), caption, tags } }
        : { action: 'update', postId: post.id, expectedRevision: state.revision, payload: { caption, tags } });
      guard();
      if (result.status !== 'published') throw new Error('Your change was not confirmed. Retry or reopen the post.');
      toast.success(state.needsOwnerConfirmation ? 'Post shared' : 'Post updated'); onOpenChange(false);
    } catch (failure) { try { guard(); setError(failure instanceof Error ? failure.message : 'Your changes were not saved.'); } catch { /* Do not affect another account or dialog. */ } }
  };
  const current = stateReader === read;
  const busy = loading || !ready || isPending || !current;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{current && state?.needsOwnerConfirmation ? 'Review and share post' : 'Edit post'}</DialogTitle></DialogHeader>
      {current && state?.needsOwnerConfirmation && <p className="text-sm text-muted-foreground">Only you can see this older post. Review its content, then save and share it again. Its audience is {state.post?.visibility === 'only_me' ? 'only you' : state.post?.visibility?.replace(/_/g, ' ')}.</p>}
      {current && state?.needsOwnerConfirmation && state.post?.mediaUrl && (state.post.type === 'post' ? <img className="max-h-40 w-full rounded-2xl object-contain" alt="Post to review" src={state.post.mediaUrl} /> : <video className="max-h-40 w-full rounded-2xl" src={state.post.mediaUrl} controls playsInline />)}
      {(loading || !ready) && <p role="status">Loading current post…</p>}
      {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p>{!state && <Button variant="outline" onClick={() => void load()} disabled={!ready}>Try again</Button>}{state && <p className="text-muted-foreground">Your draft is kept here. If the post changed elsewhere, reopen it before making another change.</p>}</div>}
      <div className="space-y-4 py-4">
        <div className="space-y-2"><Label htmlFor="post-caption">Caption</Label><Textarea id="post-caption" value={current ? caption : ''} onChange={event => setCaption(event.target.value)} rows={4} maxLength={10000} disabled={busy || !state} /></div>
        <div className="space-y-2"><Label htmlFor="post-tags">Tags (comma separated)</Label><Input id="post-tags" value={current ? tagsInput : ''} onChange={event => setTagsInput(event.target.value)} disabled={busy || !state} /></div>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void save()} disabled={busy || !state}>{isPending ? 'Saving…' : current && state?.needsOwnerConfirmation ? 'Save and share' : 'Save changes'}</Button></div>
    </DialogContent>
  </Dialog>;
}
