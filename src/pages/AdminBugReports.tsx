import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Bug, CheckCircle2, Clock, AlertTriangle, Trash2, MessageSquare, ChevronDown, ChevronUp, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useModeration';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { isAdminRole, isStaffGateLoading } from '@/lib/adminAccess';
import { Button } from '@/components/ui/button';

type BugStatus = 'pending' | 'reviewing' | 'fixed' | 'wont_fix' | 'duplicate';
type AdminBugReport = {
  id: string;
  status: string;
  error_message: string;
  error_stack?: string | null;
  page_url?: string | null;
  ai_analysis?: string | null;
  created_at: string;
  reporter?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};

const STATUS_CONFIG: Record<BugStatus, { label: string; icon: typeof Bug; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-500' },
  reviewing: { label: 'Reviewing', icon: Bug, color: 'text-blue-500' },
  fixed: { label: 'Fixed', icon: CheckCircle2, color: 'text-green-500' },
  wont_fix: { label: "Won't Fix", icon: AlertTriangle, color: 'text-muted-foreground' },
  duplicate: { label: 'Duplicate', icon: AlertTriangle, color: 'text-orange-500' },
};

export default function AdminBugReports() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { authReady, user } = useAuth();
  const profileId = useAuthProfileId();
  const { data: userRole, isLoading: roleLoading, isFetched: roleFetched } = useUserRole();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<BugStatus | 'all'>('all');
  const canViewBugs = isAdminRole(userRole);
  const bugsQueryEnabled = authReady && !!user && roleFetched && canViewBugs;

  const {
    data: bugs = [],
    isLoading: bugsLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-bug-reports', filter],
    queryFn: async () => {
      let query = supabase
        .from('bug_reports')
        .select('id, status, error_message, error_stack, page_url, ai_analysis, created_at, reporter_id')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data: rows, error: queryError } = await query;
      if (queryError) throw queryError;
      if (!rows?.length) return [] as AdminBugReport[];

      const reporterIds = [...new Set(rows.map((r) => r.reporter_id).filter(Boolean))];
      const { data: profiles } = reporterIds.length
        ? await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', reporterIds)
        : { data: [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[] };

      const profileById = new Map((profiles || []).map((p) => [p.id, p]));

      return rows.map((row) => ({
        ...row,
        reporter: profileById.get(row.reporter_id) ?? null,
      })) as AdminBugReport[];
    },
    enabled: bugsQueryEnabled,
    retry: 2,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const update: Record<string, unknown> = { status };
      if (status === 'fixed' || status === 'wont_fix') {
        update.resolved_at = new Date().toISOString();
        if (authUser?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', authUser.id)
            .maybeSingle();
          update.resolved_by = profile?.id || null;
        }
      }
      if (notes) update.admin_notes = notes;

      const { error: updateError } = await supabase.from('bug_reports').update(update as never).eq('id', id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bug-reports'] });
      toast.success('Bug status updated');
    },
  });

  const deleteBug = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from('bug_reports').delete().eq('id', id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bug-reports'] });
      toast.success('Bug report deleted');
    },
  });

  const pendingCount = bugs.filter((b) => b.status === 'pending').length;
  const gateLoading = isStaffGateLoading(authReady, roleLoading, roleFetched, !!(user || profileId));
  const showBugLoading = gateLoading || (canViewBugs && bugsLoading);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="p-2 -ml-2 hover:bg-muted rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Bug className="w-5 h-5 text-primary" />
              Bug Reports
            </h1>
            <p className="text-xs text-muted-foreground">
              {pendingCount} pending · {bugs.length} total
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
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
      </div>

      {/* Bug list */}
      <div className="p-4 space-y-3">
        {gateLoading || showBugLoading ? (
          <div className="text-center text-muted-foreground py-12 text-sm">Loading bug reports...</div>
        ) : !canViewBugs ? (
          <div className="text-center text-muted-foreground py-12 text-sm">Admin access required.</div>
        ) : isError ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-destructive">Failed to load bug reports: {(error as Error).message}</p>
            <Button size="sm" variant="secondary" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : bugs.length === 0 ? (
          <div className="text-center py-12">
            <Bug className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No bug reports yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Users will find them soon! 🐛</p>
          </div>
        ) : (
          bugs.map((bug) => {
            const expanded = expandedId === bug.id;
            const status = STATUS_CONFIG[bug.status as BugStatus] || STATUS_CONFIG.pending;
            const StatusIcon = status.icon;

            return (
              <div key={bug.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(expanded ? null : bug.id)}
                  className="w-full p-4 text-left flex items-start gap-3"
                >
                  <StatusIcon className={`w-5 h-5 mt-0.5 shrink-0 ${status.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">
                      {bug.error_message.substring(0, 80)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {bug.reporter?.username || bug.reporter?.display_name || 'Unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground/50">·</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(bug.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {/* Expanded details */}
                {expanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {/* AI Analysis */}
                    {bug.ai_analysis && (
                      <div className="bg-primary/5 rounded-xl p-3">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          AI Analysis
                        </p>
                        <p className="text-xs text-foreground/80 leading-relaxed">{bug.ai_analysis}</p>
                      </div>
                    )}

                    {/* Error details */}
                    <div className="bg-muted/50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Error</p>
                      <p className="text-xs text-foreground font-mono break-all">{bug.error_message}</p>
                    </div>

                    {bug.error_stack && (
                      <div className="bg-muted/50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Stack Trace</p>
                        <pre className="text-[10px] text-muted-foreground font-mono break-all whitespace-pre-wrap max-h-32 overflow-auto">
                          {bug.error_stack}
                        </pre>
                      </div>
                    )}

                    {bug.page_url && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold">Page:</span> {bug.page_url}
                      </p>
                    )}

                    {/* Status actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {bug.status !== 'reviewing' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: bug.id, status: 'reviewing' })}
                          className="px-3 py-1.5 bg-blue-500/10 text-blue-500 rounded-lg text-xs font-medium hover:bg-blue-500/20 transition-colors"
                        >
                          Mark Reviewing
                        </button>
                      )}
                      {bug.status !== 'fixed' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: bug.id, status: 'fixed' })}
                          className="px-3 py-1.5 bg-green-500/10 text-green-500 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors"
                        >
                          Mark Fixed
                        </button>
                      )}
                      {bug.status !== 'wont_fix' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: bug.id, status: 'wont_fix' })}
                          className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors"
                        >
                          Won't Fix
                        </button>
                      )}
                      {bug.status !== 'duplicate' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: bug.id, status: 'duplicate' })}
                          className="px-3 py-1.5 bg-orange-500/10 text-orange-500 rounded-lg text-xs font-medium hover:bg-orange-500/20 transition-colors"
                        >
                          Duplicate
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm('Delete this bug report?')) {
                            deleteBug.mutate(bug.id);
                          }
                        }}
                        className="px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-xs font-medium hover:bg-destructive/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
