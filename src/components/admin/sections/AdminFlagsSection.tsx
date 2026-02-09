import { useContentFlags, useUpdateFlag } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export function AdminFlagsSection() {
  const { profile } = useAuth();
  const { data: flags = [], isLoading } = useContentFlags();
  const updateFlag = useUpdateFlag();

  const handleFlagAction = async (id: string, status: 'approved' | 'rejected') => {
    if (!profile?.id) return;
    try {
      await updateFlag.mutateAsync({ id, status, reviewed_by: profile.id });
      toast.success(`Content ${status}`);
    } catch {
      toast.error('Failed to update flag');
    }
  };

  return (
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Content Flags</CardTitle>
            <CardDescription>AI-detected content for review</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : flags.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No flags</div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {flags.map((flag) => (
                <div key={flag.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{flag.content_type}</Badge>
                    <Badge variant={flag.status === 'pending' ? 'destructive' : 'secondary'}>
                      {flag.status}
                    </Badge>
                  </div>
                  <p className="text-sm">{flag.flagged_text || 'No text'}</p>
                  <p className="text-xs text-muted-foreground">
                    AI Score: {flag.ai_score || 'N/A'} • {formatDistanceToNow(new Date(flag.created_at), { addSuffix: true })}
                  </p>
                  {flag.status === 'pending' && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => handleFlagAction(flag.id, 'approved')}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleFlagAction(flag.id, 'rejected')}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
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
