import { useEffect, useMemo, useRef } from 'react';
import { useContentFlags, useUpdateFlag, type ContentFlag } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { contentFlagContextPath, hasContentFlagContext } from '@/lib/contentFlagContext';
import { isReportSessionError, reportAccountGuard } from '@/lib/reportModerationService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

const safeText = (value: unknown) => typeof value === 'string' ? value : '';
const dateLabel = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? formatDistanceToNow(new Date(value), { addSuffix: true }) : 'Date unavailable';

export function AdminFlagsSection() {
  const { user } = useAuth();
  const session = useReportAccountSession();
  return <FlagsForSession key={`${user?.id}:${session.epoch}`} uid={user?.id} epoch={session.epoch} />;
}

function FlagsForSession({ uid, epoch }: { uid?: string; epoch: number }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const query = useContentFlags();
  const flags = query.data || [];
  const updateFlag = useUpdateFlag();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const accountGuard = useMemo(() => reportAccountGuard(uid || ''), [uid, epoch]);
  const guard = () => {
    accountGuard();
    if (!mounted.current) throw Object.assign(new Error('This review is no longer open.'), { code: 'account-changed' });
  };

  const handleFlagAction = async (id: string, status: 'approved' | 'rejected') => {
    if (!profile?.id) return;
    try {
      guard();
      await updateFlag.mutateAsync({ id, status, reviewed_by: profile.id });
      guard();
      toast.success(`Flag marked ${status}. This did not change the content.`);
    } catch (error) {
      if (isReportSessionError(error) || !mounted.current) return;
      try { guard(); } catch { return; }
      toast.error('Failed to update flag');
    }
  };

  const openContext = async (flag: ContentFlag) => {
    try {
      const path = await contentFlagContextPath(flag, guard, uid && profile?.user_id === uid ? { expectedOwnerUid: uid, expectedProfileId: profile.id } : undefined);
      guard();
      if (path) navigate(path);
      else toast.message('Context unavailable for this legacy flag.');
    } catch (error) {
      if (isReportSessionError(error) || !mounted.current) return;
      try { guard(); } catch { return; }
      toast.error('Context could not be loaded. Please try again.');
    }
  };

  return (
    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/15">
            <AlertTriangle className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </div>
          <div>
            <CardTitle className="text-lg text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Content Flags</CardTitle>
            <CardDescription className="text-foreground/70">Legacy content flags. Target references and stored text are unverified.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {query.isError ? (
          <div role="alert" className="space-y-3 py-6"><p>Content flags could not be loaded. This does not mean the queue is empty.</p><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry flags</Button></div>
        ) : query.isPending ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : flags.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No flags</div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px] max-h-[600px] pr-3">
            <div className="space-y-3">
              {flags.map((flag) => (
                <div key={flag.id} className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/5 space-y-3 transition-all hover:bg-card/80">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="rounded-full px-3">{safeText(flag.content_type) || 'Unknown target'}</Badge>
                    <Badge variant={flag.status === 'pending' ? 'destructive' : 'secondary'} className="rounded-full px-3">
                      {safeText(flag.status) || 'Unknown status'}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{safeText(flag.flagged_text) || 'No text'}</p>
                  <p className="text-xs text-muted-foreground">
                    AI Score: {typeof flag.ai_score === 'number' && Number.isFinite(flag.ai_score) ? flag.ai_score : 'N/A'} • {dateLabel(flag.created_at)}
                  </p>
                  <div className="flex gap-2 pt-1 flex-wrap">
                    {hasContentFlagContext(flag) ? <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => void openContext(flag)}>
                      <ExternalLink className="h-4 w-4 mr-1.5" /> View Context
                    </Button> : <p className="text-xs text-muted-foreground">{flag.content_type === 'message' ? 'Message context unavailable. This legacy flag has no verified message snapshot.' : 'Context unavailable for this target.'}</p>}
                    {flag.status === 'pending' && (
                      <>
                        <Button size="sm" className="rounded-xl" onClick={() => handleFlagAction(flag.id, 'approved')}>
                          <CheckCircle className="h-4 w-4 mr-1.5" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => handleFlagAction(flag.id, 'rejected')}>
                          <XCircle className="h-4 w-4 mr-1.5" /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
