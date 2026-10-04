import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Code2, Copy, Flag, Gamepad2, Globe, Loader2, Palette, Play, Plus, Search, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ReportContentDialog } from '@/components/safety/ReportContentDialog';
import { useSafetyReport } from '@/hooks/useSafetyReport';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { useAuth } from '@/lib/auth';
import { MiniAppRunner } from '@/features/mini-apps/MiniAppRunner';
import { MiniAppStudio } from '@/features/mini-apps/MiniAppStudio';
import { miniAppError, type MiniAppRecord } from '@/features/mini-apps/model';
import { getPublishedMiniApp, listMiniAppsPage, unpublishMiniApp, type MiniAppPage } from '@/features/mini-apps/repository';

const categoryIcons = { game: Gamepad2, tool: Wrench, art: Palette };

export default function MiniApps() {
  const { user } = useAuth();
  const session = useReportAccountSession();
  // Tear down private source and executing code immediately on account changes.
  return <MiniAppsForUser key={`${user?.id || 'signed-out'}:${session.epoch}`} epoch={session.epoch} />;
}

function MiniAppsForUser({ epoch }: { epoch: number }) {
  const submitSafetyReport = useSafetyReport();
  const { user, profile } = useAuth();
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('discover');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ draft: MiniAppRecord | null } | null>(null);
  // Detail navigation closes the studio; returning must show the library,
  // not remount an editor from stale local state. Unsaved recovery stays intact.
  useEffect(() => { if (appId) setEditing(null); }, [appId]);
  const [unpublishTarget, setUnpublishTarget] = useState<MiniAppRecord | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ownerId = user?.id || '';
  const pageOptions = { initialPageParam: undefined as string | undefined, getNextPageParam: (page: MiniAppPage) => page.nextCursor ?? undefined,
    staleTime: 0, gcTime: 0, retry: false as const };
  const apps = useInfiniteQuery({ ...pageOptions, queryKey: ['mini-apps', 'pages', 'published', ownerId, epoch], queryFn: ({ pageParam }) => listMiniAppsPage(ownerId, 'published', pageParam), enabled: Boolean(ownerId) && !appId && tab === 'discover' });
  const drafts = useInfiniteQuery({ ...pageOptions, queryKey: ['mini-apps', 'pages', 'drafts', ownerId, epoch], queryFn: ({ pageParam }) => listMiniAppsPage(ownerId, 'drafts', pageParam), enabled: Boolean(ownerId) && !appId && tab === 'drafts' });
  const detail = useQuery({ queryKey: ['mini-apps', 'detail', appId, ownerId, epoch], queryFn: () => getPublishedMiniApp(appId!), enabled: Boolean(ownerId && appId), retry: false });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['mini-apps'] }); };
  const activeList = tab === 'discover' ? apps : drafts;
  const loaded = [...new Map((activeList.data?.pages.flatMap(page => page.apps) || []).map(app => [app.id, app])).values()];
  const visible = loaded.filter(app => `${app.title} ${app.description} ${app.category}`.toLowerCase().includes(search.trim().toLowerCase()));

  const unpublish = async () => {
    if (!unpublishTarget || unpublishing) return;
    setUnpublishing(true);
    try {
      await unpublishMiniApp(ownerId, unpublishTarget);
      if (!mounted.current) return;
      refresh();
      toast.success('App unpublished. Your private draft is still available.');
      setUnpublishTarget(null);
      if (appId) navigate('/mini-apps');
    } catch (error) {
      if (mounted.current) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'mini-app-publication-conflict') {
          setUnpublishTarget(null); refresh();
        }
        toast.error(miniAppError(error));
      }
    }
    finally { if (mounted.current) setUnpublishing(false); }
  };

  const report = async (reason: string) => {
    if (!detail.data || !profile || !ownerId) throw new Error('Sign in again to report this app.');
    await submitSafetyReport({ targetType: 'mini_app', targetId: detail.data.id, reason });
    if (mounted.current) toast.success('Report submitted for review.');
  };

  const content = appId ? (
    <div className="space-y-5">
      <Button variant="ghost" onClick={() => navigate('/mini-apps')}><ArrowLeft />All mini apps</Button>
      {detail.isLoading || (detail.isFetching && !detail.data) ? <Loading /> : detail.isError ? <ErrorNotice error={detail.error} onRetry={() => void detail.refetch()} /> : !detail.data ? <div className="rounded-2xl border border-border p-8 text-center"><h1 className="text-xl font-bold">App unavailable</h1><p className="mt-2 text-muted-foreground">This app is no longer published.</p></div> : <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><span className="text-xs uppercase tracking-wider text-primary">Community {detail.data.category}</span><h1 className="mt-1 break-words text-3xl font-bold">{detail.data.title}</h1><p className="mt-2 break-words text-muted-foreground">{detail.data.description}</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/mini-apps/${detail.data!.id}`).then(() => toast.success('App link copied.'), () => toast.error('Could not copy. Copy this page URL from your browser.')); }}><Copy />Copy link</Button><Button size="sm" variant="ghost" onClick={() => setReportOpen(true)}><Flag />Report</Button>{detail.data.owner_id === ownerId && <Button size="sm" variant="ghost" onClick={() => setUnpublishTarget(detail.data!)}>Unpublish</Button>}</div>
        </div>
        <MiniAppRunner key={detail.data.id} source={detail.data} />
        <p className="text-xs text-muted-foreground">Created by a VYBE community member. Close the preview whenever you’re done.</p>
      </>}
    </div>
  ) : editing ? <MiniAppStudio key={editing.draft?.id || 'new'} ownerId={ownerId} draft={editing.draft} onClose={() => setEditing(null)} onSaved={refresh} /> : (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card/90 to-accent/10 p-6 sm:p-8">
        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary"><Code2 className="h-4 w-4" />VYBE Hub</div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Small apps. Big ideas.</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Games, creative experiments, and useful little tools. Build with code, try a template, and publish something everyone can open.</p>
        <Button className="mt-5" onClick={() => setEditing({ draft: null })}><Plus />Build a mini app</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" disabled={activeList.isFetching} onClick={() => void activeList.refetch()}>Refresh apps</Button>
        <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="discover">Discover</TabsTrigger><TabsTrigger value="drafts">My drafts</TabsTrigger></TabsList></Tabs>
        <div className="relative w-full sm:w-64"><Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a mini app" aria-label="Search mini apps" aria-describedby="mini-app-search-scope" /></div>
      </div>
      <p id="mini-app-search-scope" className="text-xs text-muted-foreground">{`Search covers ${loaded.length} loaded ${loaded.length === 1 ? 'app' : 'apps'}.`}{activeList.hasNextPage && ' Load more to include more creations.'}</p>
      {activeList.isLoading ? <Loading /> : (activeList.isError && !activeList.isFetchNextPageError) ? <ErrorNotice error={activeList.error} onRetry={() => void activeList.refetch()} /> : visible.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-9 text-center"><Code2 aria-hidden className="mx-auto mb-3 h-10 w-10 text-primary" /><h2 className="font-semibold">{search ? activeList.hasNextPage ? 'No matches in loaded apps' : 'No matching apps' : tab === 'drafts' ? 'Your next idea starts here' : 'Make the first mini app'}</h2><p className="mt-2 text-sm text-muted-foreground">{search ? activeList.hasNextPage ? 'Load more creations to keep searching, or try another name or category.' : 'Try a different name or category.' : 'Start with a template, change the code, and make it your own.'}</p>{!search && <Button className="mt-4" variant="outline" onClick={() => setEditing({ draft: null })}>Open studio</Button>}</div> : <div className="grid gap-4 sm:grid-cols-2">
        {visible.map(app => {
          const Icon = categoryIcons[app.category] || Code2;
          return <article key={app.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card/70 p-5 transition-colors hover:border-primary/40">
            <div className="mb-4 flex items-center justify-between"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><Icon aria-hidden className="h-6 w-6" /></div><span className="flex items-center gap-1 text-xs text-muted-foreground">{tab === 'discover' && <Globe className="h-3 w-3" />}{tab === 'discover' ? app.category : 'Private draft'}</span></div>
            <h2 className="break-words text-lg font-semibold">{app.title}</h2><p className="mt-1 flex-1 break-words text-sm text-muted-foreground">{app.description || 'A little creation from the VYBE community.'}</p>
            <div className="mt-5 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => tab === 'drafts' ? setEditing({ draft: app }) : navigate(`/mini-apps/${app.id}`)}>{tab === 'drafts' ? <Code2 /> : <Play />}{tab === 'drafts' ? 'Edit draft' : 'Open app'}</Button>{tab === 'discover' && app.owner_id === ownerId && <Button size="sm" variant="ghost" onClick={() => setUnpublishTarget(app)}>Unpublish</Button>}</div>
          </article>;
        })}
      </div>}
      {activeList.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">More apps could not be loaded. Your loaded apps are still available.</p>}
      {activeList.hasNextPage && <Button className="rounded-full" variant="outline" disabled={activeList.isFetching} onClick={() => void activeList.fetchNextPage()}>{activeList.isFetchingNextPage ? 'Loading more apps…' : activeList.isFetchNextPageError ? 'Retry loading more' : 'Load more apps'}</Button>}
      <p className="text-xs text-muted-foreground">{tab === 'drafts' ? 'Only you can see your drafts. Publishing creates a separate version for the community.' : 'Apps start only after you choose Run app.'}</p>
    </div>
  );

  return <AppLayout hideRightSidebar><div className="mx-auto w-full max-w-4xl px-2 pb-8 pt-2 sm:px-4">{content}</div>
    <AlertDialog open={Boolean(unpublishTarget)} onOpenChange={open => { if (!open && !unpublishing) setUnpublishTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Unpublish this mini app?</AlertDialogTitle><AlertDialogDescription>Its public page will become unavailable. Your private draft is kept so you can publish again later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={unpublishing}>Keep published</AlertDialogCancel><AlertDialogAction disabled={unpublishing} onClick={event => { event.preventDefault(); void unpublish(); }}>{unpublishing ? 'Unpublishing…' : 'Unpublish'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <ReportContentDialog key={submitSafetyReport.sessionKey + ':' + appId} open={reportOpen} onOpenChange={setReportOpen} title="Report mini app" onSubmit={report} />
  </AppLayout>;
}

function Loading() { return <div role="status" className="flex justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />Loading mini apps…</div>; }
function ErrorNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) { return <div role="alert" className="rounded-2xl border border-border p-6"><p className="text-sm text-muted-foreground">{miniAppError(error)}</p><Button className="mt-3" variant="outline" onClick={onRetry}>Try again</Button></div>; }
