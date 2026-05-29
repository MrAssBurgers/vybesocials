import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Bug, RefreshCw, Trash2, CheckCircle2, Clock, ChevronDown, ChevronUp, MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';


type BugStatus = 'pending' | 'reviewing' | 'fixed' | 'wont_fix' | 'duplicate';

const STATUS_CONFIG: Record<BugStatus, { label: string; icon: typeof Bug; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-500' },
  reviewing: { label: 'Reviewing', icon: Bug, color: 'text-blue-500' },
  fixed: { label: 'Fixed', icon: CheckCircle2, color: 'text-green-500' },
  wont_fix: { label: "Won't Fix", icon: AlertTriangle, color: 'text-muted-foreground' },
  duplicate: { label: 'Duplicate', icon: AlertTriangle, color: 'text-orange-500' },
};

export function AdminErrorsSection() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<BugStatus | 'all'>('all');

  const { data: bugs = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-bug-reports-inline', filter],
    queryFn: async () => {
      // Slim list query — skip heavy fields (error_stack, browser_info, user_agent)
      // to keep payload tiny. Full record is fetched lazily on row expand.
      let query = supabase
        .from('bug_reports')
        .select('id, error_message, page_url, status, created_at, ai_analysis, ai_severity, reporter_id, reporter:profiles!bug_reports_reporter_id_fkey(username, display_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev,
  });

  // Lazy fetch full payload (error_stack) only when a row is expanded.
  const { data: expandedDetail } = useQuery({
    queryKey: ['admin-bug-report-detail', expandedId],
    enabled: !!expandedId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bug_reports')
        .select('id, error_stack, component_stack, user_agent')
        .eq('id', expandedId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const update: Record<string, unknown> = { status };
      if (status === 'fixed' || status === 'wont_fix') {
        update.resolved_at = new Date().toISOString();
        // Use profile id (not auth user id) to satisfy FK constraint
        if (user?.id) {
          const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user.id).single();
          update.resolved_by = profile?.id || null;
        }
      }
      const { error } = await supabase.from('bug_reports').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bug-reports-inline'] });
      toast.success('Bug status updated');
    },
  });

  const deleteBug = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bug_reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bug-reports-inline'] });
      toast.success('Bug report deleted');
    },
  });

  const pendingCount = bugs.filter((b: any) => b.status === 'pending').length;

  if (isLoading) {
    return <div className="p-4 text-muted-foreground text-sm">Loading bug reports...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
          <AlertTriangle className="w-4 h-4" />
          {pendingCount} pending
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-sm">
          <Bug className="w-4 h-4" />
          {bugs.length} total
        </div>
      <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const unfixed = bugs.filter((b: any) => b.status !== 'fixed');
            if (unfixed.length === 0) { toast.info('No unfixed bugs to copy'); return; }
            const text = unfixed.map((b: any) => `[${b.status}] ${b.error_message}${b.page_url ? ` (${b.page_url})` : ''}`).join('\n\n');
            navigator.clipboard.writeText(text);
            toast.success(`Copied ${unfixed.length} unfixed errors to clipboard`);
          }}>
            Copy All
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            if (!confirm(`Mark all ${bugs.length} visible bugs as fixed?`)) return;
            const ids = bugs.filter((b: any) => b.status !== 'fixed').map((b: any) => b.id);
            if (ids.length === 0) { toast.info('All already fixed'); return; }
            const { data: { user } } = await supabase.auth.getUser();
            // Use profile id lookup to avoid FK constraint violation
            let resolvedBy: string | null = null;
            if (user?.id) {
              const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user.id).single();
              resolvedBy = profile?.id || null;
            }
            const { error } = await supabase.from('bug_reports').update({ status: 'fixed', resolved_at: new Date().toISOString(), resolved_by: resolvedBy }).in('id', ids);
            if (error) { toast.error('Failed to update: ' + error.message); return; }
            queryClient.invalidateQueries({ queryKey: ['admin-bug-reports-inline'] });
            toast.success(`Marked ${ids.length} bugs as fixed`);
          }}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Fix All
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(['all', 'pending', 'reviewing', 'fixed', 'wont_fix', 'duplicate'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {bugs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No bug reports yet. 🎉
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {bugs.map((bug: any) => {
            const expanded = expandedId === bug.id;
            const status = STATUS_CONFIG[bug.status as BugStatus] || STATUS_CONFIG.pending;
            const StatusIcon = status.icon;

            return (
              <div key={bug.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : bug.id)}
                  className="w-full p-3 text-left flex items-start gap-3"
                >
                  <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${status.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">
                      {bug.error_message.substring(0, 80)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {bug.reporter?.username || bug.reporter?.display_name || 'Unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground/50">·</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(bug.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {expanded && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                    {bug.ai_analysis && (
                      <div className="bg-primary/5 rounded-xl p-2.5">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          AI Analysis
                          {bug.ai_severity && bug.ai_severity !== 'auto' && bug.ai_severity !== 'unknown' && (
                            <span className={`ml-auto px-1.5 py-0.5 rounded-md text-[10px] uppercase tracking-wide ${
                              bug.ai_severity === 'critical' ? 'bg-destructive/20 text-destructive' :
                              bug.ai_severity === 'high' ? 'bg-orange-500/20 text-orange-500' :
                              bug.ai_severity === 'medium' ? 'bg-yellow-500/20 text-yellow-500' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {bug.ai_severity}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{bug.ai_analysis}</p>
                      </div>
                    )}

                    <div className="bg-muted/50 rounded-xl p-2.5">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Error</p>
                      <p className="text-xs text-foreground font-mono break-all">{bug.error_message}</p>
                    </div>

                    {expandedDetail?.error_stack && (
                      <div className="bg-muted/50 rounded-xl p-2.5">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Stack Trace</p>
                        <pre className="text-[10px] text-muted-foreground font-mono break-all whitespace-pre-wrap max-h-32 overflow-auto">
                          {expandedDetail.error_stack}
                        </pre>
                      </div>
                    )}

                    {bug.page_url && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold">Page:</span> {bug.page_url}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {bug.status !== 'reviewing' && (
                        <button onClick={() => updateStatus.mutate({ id: bug.id, status: 'reviewing' })} className="px-3 py-1.5 bg-blue-500/10 text-blue-500 rounded-lg text-xs font-medium hover:bg-blue-500/20 transition-colors">
                          Mark Reviewing
                        </button>
                      )}
                      {bug.status !== 'fixed' && (
                        <button onClick={() => updateStatus.mutate({ id: bug.id, status: 'fixed' })} className="px-3 py-1.5 bg-green-500/10 text-green-500 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors">
                          Mark Fixed
                        </button>
                      )}
                      {bug.status !== 'wont_fix' && (
                        <button onClick={() => updateStatus.mutate({ id: bug.id, status: 'wont_fix' })} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors">
                          Won't Fix
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('Delete this bug report?')) deleteBug.mutate(bug.id); }}
                        className="px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-xs font-medium hover:bg-destructive/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
