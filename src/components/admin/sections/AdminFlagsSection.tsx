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
    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/15">
            <AlertTriangle className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </div>
          <div>
            <CardTitle className="text-lg text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Content Flags</CardTitle>
            <CardDescription className="text-foreground/70">AI-detected content for review</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : flags.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No flags</div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px] max-h-[600px] pr-3">
            <div className="space-y-3">
              {flags.map((flag) => (
                <div key={flag.id} className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/5 space-y-3 transition-all hover:bg-card/80">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="rounded-full px-3">{flag.content_type}</Badge>
                    <Badge variant={flag.status === 'pending' ? 'destructive' : 'secondary'} className="rounded-full px-3">
                      {flag.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{flag.flagged_text || 'No text'}</p>
                  <p className="text-xs text-muted-foreground">
                    AI Score: {flag.ai_score || 'N/A'} • {formatDistanceToNow(new Date(flag.created_at), { addSuffix: true })}
                  </p>
                  {flag.status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="rounded-xl" onClick={() => handleFlagAction(flag.id, 'approved')}>
                        <CheckCircle className="h-4 w-4 mr-1.5" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => handleFlagAction(flag.id, 'rejected')}>
                        <XCircle className="h-4 w-4 mr-1.5" /> Reject
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
