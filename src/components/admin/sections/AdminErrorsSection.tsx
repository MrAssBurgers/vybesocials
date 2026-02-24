import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Bug, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ErrorLog {
  id: string;
  error_message: string;
  error_type: string;
  page_url: string | null;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
}

export function AdminErrorsSection() {
  const { data: errors = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-error-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_logs')
        .select('id, error_message, error_type, page_url, user_id, session_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as ErrorLog[];
    },
    staleTime: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-error-stats'],
    queryFn: async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600_000).toISOString();
      const oneDayAgo = new Date(now.getTime() - 86400_000).toISOString();

      const [hourRes, dayRes] = await Promise.all([
        supabase.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
      ]);

      return {
        lastHour: hourRes.count || 0,
        lastDay: dayRes.count || 0,
      };
    },
    staleTime: 30_000,
  });

  const handleCleanup = async () => {
    const { error } = await supabase.rpc('cleanup_old_error_logs');
    if (error) {
      toast.error('Cleanup failed');
    } else {
      toast.success('Old error logs cleaned up');
      refetch();
    }
  };

  if (isLoading) {
    return <div className="p-4 text-muted-foreground text-sm">Loading error logs...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
          <AlertTriangle className="w-4 h-4" />
          {stats?.lastHour || 0} errors (1h)
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-sm">
          <Bug className="w-4 h-4" />
          {stats?.lastDay || 0} errors (24h)
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleCleanup}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Cleanup 30d+
          </Button>
        </div>
      </div>

      {errors.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No errors logged. 🎉
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {errors.map((err) => (
            <div key={err.id} className="p-3 rounded-lg bg-card border border-border text-sm space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-destructive break-all line-clamp-2">
                  {err.error_message}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(err.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="px-1.5 py-0.5 rounded bg-muted">{err.error_type}</span>
                {err.page_url && <span className="truncate max-w-[200px]">{err.page_url}</span>}
                {err.user_id && <span className="font-mono">{err.user_id.slice(0, 8)}…</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
