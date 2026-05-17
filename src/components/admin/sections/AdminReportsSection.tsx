import { useQuery } from '@tanstack/react-query';
import { useReports, useUpdateReport } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Flag, Eye, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

function useDeletionLog() {
  return useQuery({
    queryKey: ['post-deletion-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_deletion_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function AdminReportsSection() {
  const { profile } = useAuth();
  const { data: reports = [], isLoading } = useReports();
  const { data: deletions = [], isLoading: deletionsLoading } = useDeletionLog();
  const updateReport = useUpdateReport();

  const handleReportAction = async (id: string, status: 'reviewed' | 'dismissed' | 'actioned') => {
    if (!profile?.id) return;
    try {
      await updateReport.mutateAsync({ id, status, reviewed_by: profile.id });
      toast.success(`Report ${status}`);
    } catch {
      toast.error('Failed to update report');
    }
  };

  return (
    <div className="space-y-4">
    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/15">
            <Flag className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </div>
          <div>
            <CardTitle className="text-lg text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">User Reports</CardTitle>
            <CardDescription className="text-foreground/70">Review reported content</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No reports</div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px] max-h-[600px] pr-3">
            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/5 space-y-3 transition-all hover:bg-card/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 ring-2 ring-white/10">
                        <AvatarImage src={report.reporter?.avatar_url || ''} />
                        <AvatarFallback className="bg-primary/20 text-primary">{report.reporter?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{report.reporter?.username}</span>
                    </div>
                    <Badge variant={report.status === 'pending' ? 'destructive' : 'secondary'} className="rounded-full px-3">
                      {report.status}
                    </Badge>
                  </div>
                  {report.reported_user && (
                    <p className="text-xs text-foreground/70">
                      Target: <span className="font-medium">@{report.reported_user.username}</span>
                    </p>
                  )}
                  {report.post && (
                    <p className="text-xs text-foreground/70 line-clamp-1">
                      Post: {report.post.caption || '(media post)'}
                    </p>
                  )}
                  <p className="text-sm text-foreground/90 leading-relaxed">{report.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                  </p>
                  {report.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => handleReportAction(report.id, 'reviewed')}>
                        <Eye className="h-4 w-4 mr-1.5" /> Review
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => handleReportAction(report.id, 'actioned')}>
                        <CheckCircle className="h-4 w-4 mr-1.5" /> Action
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => handleReportAction(report.id, 'dismissed')}>
                        <XCircle className="h-4 w-4 mr-1.5" /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>

    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-destructive/15">
            <Trash2 className="h-5 w-5 text-destructive drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </div>
          <div>
            <CardTitle className="text-lg text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Deleted Posts</CardTitle>
            <CardDescription className="text-foreground/70">Audit log of post deletions (latest 100)</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {deletionsLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : deletions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No deletions logged</div>
        ) : (
          <ScrollArea className="max-h-[400px] pr-3">
            <div className="space-y-2">
              {deletions.map((d: any) => (
                <div key={d.id} className="p-3 rounded-xl bg-card/60 border border-white/5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="rounded-full">{d.post_type || 'post'}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {d.caption && (
                    <p className="text-foreground/80 mt-1 line-clamp-2">{d.caption}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    post_id: <code className="text-foreground/70">{d.post_id}</code>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    deleted_by: <code className="text-foreground/70">{d.deleted_by}</code>
                    {d.author_id && <> · author: <code className="text-foreground/70">{d.author_id}</code></>}
                  </p>
                  {d.reason && <p className="text-xs text-muted-foreground">reason: {d.reason}</p>}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
