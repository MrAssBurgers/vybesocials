import { useReports, useUpdateReport } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Flag, Eye, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export function AdminReportsSection() {
  const { profile } = useAuth();
  const { data: reports = [], isLoading } = useReports();
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
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Flag className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>User Reports</CardTitle>
            <CardDescription>Review reported content</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No reports</div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={report.reporter?.avatar_url || ''} />
                        <AvatarFallback>{report.reporter?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{report.reporter?.username}</span>
                    </div>
                    <Badge variant={report.status === 'pending' ? 'destructive' : 'secondary'}>
                      {report.status}
                    </Badge>
                  </div>
                  <p className="text-sm">{report.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                  </p>
                  {report.status === 'pending' && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={() => handleReportAction(report.id, 'reviewed')}>
                        <Eye className="h-4 w-4 mr-1" /> Review
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleReportAction(report.id, 'actioned')}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Action
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReportAction(report.id, 'dismissed')}>
                        <XCircle className="h-4 w-4 mr-1" /> Dismiss
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
  );
}
