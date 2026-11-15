import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { X, MailOpen } from 'lucide-react';
import { useAnnouncements, useDismissAnnouncement } from '@/hooks/useAnnouncements';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { AnnouncementMediaPreview } from './AnnouncementMediaPreview';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export function AnnouncementModal() {
  const profileId = useAuthProfileId();
  const session = useReportAccountSession();
  if (!profileId || !session.uid) return null;
  return <AnnouncementAccountView key={`${session.uid}:${session.epoch}:${profileId}`} />;
}

function AnnouncementAccountView() {
  const query = useAnnouncements();
  const announcements = query.data || [];
  const dismissMutation = useDismissAnnouncement();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const reducedMotion = useReducedMotion();
  const latest = announcements[0];
  const selected = announcements.find(item => item.id === selectedId);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (selectedId && (!selected || query.isError)) setSelectedId(null);
  }, [selectedId, selected, query.isError]);

  const dismiss = async (id: string) => {
    if (pending.current) return;
    pending.current = true;
    setPendingId(id);
    setFailure(null);
    try {
      await dismissMutation.mutateAsync(id);
      if (mounted.current) setSelectedId(current => current === id ? null : current);
    } catch {
      if (mounted.current) setFailure({ id, message: "Couldn't dismiss this announcement. Please try again." });
    } finally {
      if (mounted.current) { pending.current = false; setPendingId(null); }
    }
  };

  if (query.isError) return <div role="alert" className="mx-auto my-4 max-w-md rounded-2xl border border-border bg-card p-4 space-y-3">
    <p className="text-sm">Couldn't load announcements.</p>
    <Button variant="outline" className="min-h-11" disabled={query.isFetching} aria-busy={query.isFetching} onClick={() => { void query.refetch(); }}>Retry announcements</Button>
  </div>;
  if (!latest) return null;
  const open = !!selected;
  const created = selected ? new Date(selected.created_at) : null;
  const createdLabel = created && Number.isFinite(created.getTime()) ? formatDistanceToNow(created, { addSuffix: true }) : 'Recently';

  return <>
    <motion.div initial={reducedMotion ? false : { scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-2 my-4">
      <div className="relative rounded-2xl bg-card border border-border shadow-lg group">
        <button ref={opener} type="button" aria-label={`Open announcement: ${latest.title}`}
          onClick={() => setSelectedId(latest.id)}
          className="relative flex items-center gap-3 min-h-14 pl-6 pr-16 py-4 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <motion.span aria-hidden="true" className="text-2xl"
            animate={reducedMotion || open ? { rotate: 0 } : { rotate: [0, -10, 10, -5, 0] }}
            transition={reducedMotion || open ? { duration: 0 } : { duration: 1.5, repeat: Infinity, repeatDelay: 3 }}>📬</motion.span>
          <span><span className="block font-bold text-sm text-foreground">New Announcement!</span><span className="block text-xs text-muted-foreground">Open to read</span></span>
          <motion.span aria-hidden="true" className="ml-1 w-2 h-2 rounded-full bg-primary"
            animate={reducedMotion || open ? { scale: 1, opacity: 1 } : { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
            transition={reducedMotion || open ? { duration: 0 } : { duration: 1.5, repeat: Infinity }} />
        </button>
        <button type="button" aria-label={`Dismiss announcement: ${latest.title}`} disabled={pendingId !== null} aria-busy={pendingId === latest.id}
          onClick={() => { void dismiss(latest.id); }}
          className="absolute top-1/2 right-1 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {!open && failure?.id === latest.id && <p role="alert" className="max-w-md px-4 text-sm text-muted-foreground">{failure.message}</p>}
    </motion.div>

    <Dialog.Root open={open} onOpenChange={value => { if (!value) setSelectedId(null); }}>
      {selected && <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[159] bg-black/60 backdrop-blur-sm motion-reduce:backdrop-blur-none" />
        <div className="fixed inset-0 z-[160] flex items-start justify-center px-4 pointer-events-none"
          style={{ paddingTop: 'max(1rem, 5dvh, calc(var(--sat, 0px) + 0.75rem))', paddingBottom: 'max(1rem, var(--sab, 0px))' }}>
          <Dialog.Content className="relative pointer-events-auto w-full max-w-md max-h-[80dvh] min-h-0 flex flex-col bg-card rounded-3xl border border-border shadow-2xl overflow-hidden focus:outline-none"
            onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}>
            <div className="relative px-6 pt-6 pb-4 pr-16 shrink-0">
              <Dialog.Close asChild><button type="button" aria-label="Close announcement"
                className="absolute top-2 right-2 w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X aria-hidden="true" className="h-4 w-4" /></button></Dialog.Close>
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center"><MailOpen aria-hidden="true" className="h-5 w-5 text-primary" /></div><span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Announcement</span></div>
              <Dialog.Title className="text-xl font-bold text-foreground leading-tight break-words">{selected.title}</Dialog.Title>
            </div>
            <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
              {selected.image_url && <div className="px-4"><AnnouncementMediaPreview url={selected.image_url} mediaType={selected.media_type} className="max-h-64" /></div>}
              <Dialog.Description className="px-6 py-4 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed break-words">{selected.content}</Dialog.Description>
              {failure?.id === selected.id && <p role="alert" className="px-6 pb-4 text-sm text-muted-foreground">{failure.message}</p>}
            </div>
            <div className="px-6 pb-4 pt-3 flex flex-wrap gap-3 items-center justify-between shrink-0 border-t border-border/30">
              <div className="text-xs text-muted-foreground"><span>By @{selected.author?.username || 'VYBE'}</span><span aria-hidden="true"> · </span><span>{createdLabel}</span></div>
              <Button size="sm" variant="outline" className="min-h-11 rounded-xl text-xs" disabled={pendingId !== null} aria-busy={pendingId === selected.id} onClick={() => { void dismiss(selected.id); }}>{pendingId === selected.id ? 'Dismissing…' : 'Dismiss'}</Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>}
    </Dialog.Root>
  </>;
}
