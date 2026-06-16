import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, CheckCircle, XCircle, Clock, User, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface ModApplication {
  id: string;
  user_id: string;
  reason: string;
  experience: string | null;
  availability: string | null;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  applicant?: { username: string; avatar_url: string | null; display_name: string | null };
}

export function AdminModApplicationsSection() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['admin-mod-applications', filter],
    queryFn: async () => {
      let query = db
        .from('moderator_applications')
        .select('*, applicant:profiles!user_id(username, avatar_url, display_name)')
        .order('created_at', { ascending: false });

      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ModApplication[];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: 'approved' | 'rejected'; notes?: string }) => {
      // Update application
      const { error } = await db
        .from('moderator_applications')
        .update({
          status,
          admin_notes: notes || null,
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;

      // If approved, grant moderator role
      if (status === 'approved') {
        const app = applications.find(a => a.id === id);
        if (app) {
          const { error: roleError } = await db
            .from('user_roles')
            .upsert({ user_id: app.user_id, role: 'moderator' }, { onConflict: 'user_id,role' });
          if (roleError) console.error('Failed to assign role:', roleError);
        }
      }
    },
    onSuccess: (_, vars) => {
      toast.success(`Application ${vars.status}!`);
      queryClient.invalidateQueries({ queryKey: ['admin-mod-applications'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved': return <Badge variant="outline" className="text-green-400 border-green-500/30 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Mod Applications</h2>
          {pendingCount > 0 && (
            <Badge className="bg-primary/20 text-primary text-xs">{pendingCount}</Badge>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            className="text-xs rounded-lg h-7"
            onClick={() => setFilter('pending')}
          >
            Pending
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="text-xs rounded-lg h-7"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : applications.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No {filter === 'pending' ? 'pending ' : ''}applications</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {applications.map((app) => {
              const isExpanded = expandedId === app.id;
              return (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <GlassCard className="overflow-hidden">
                    {/* Header */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : app.id)}
                      className="w-full flex items-center justify-between p-3.5 text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {app.applicant?.avatar_url ? (
                            <img src={app.applicant.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <User className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {app.applicant?.display_name || app.applicant?.username || 'Unknown'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Applied {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(app.status)}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Expanded content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/30 pt-3">
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Why they'd be a good mod</p>
                              <p className="text-xs leading-relaxed">{app.reason}</p>
                            </div>

                            {app.experience && (
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Experience</p>
                                <p className="text-xs leading-relaxed">{app.experience}</p>
                              </div>
                            )}

                            {app.availability && (
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Availability</p>
                                <p className="text-xs leading-relaxed">{app.availability}</p>
                              </div>
                            )}

                            {app.status === 'pending' && (
                              <div className="space-y-2 pt-2">
                                <Textarea
                                  placeholder="Admin notes (optional - visible to applicant on rejection)"
                                  value={adminNotes[app.id] || ''}
                                  onChange={(e) => setAdminNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                  className="min-h-[60px] text-xs bg-background/50"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1 gap-1.5 rounded-xl text-xs bg-green-600 hover:bg-green-700"
                                    onClick={() => reviewMutation.mutate({ id: app.id, status: 'approved', notes: adminNotes[app.id] })}
                                    disabled={reviewMutation.isPending}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="flex-1 gap-1.5 rounded-xl text-xs"
                                    onClick={() => reviewMutation.mutate({ id: app.id, status: 'rejected', notes: adminNotes[app.id] })}
                                    disabled={reviewMutation.isPending}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            )}

                            {app.admin_notes && app.status !== 'pending' && (
                              <div className="p-2 rounded-lg bg-muted/30">
                                <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Admin Notes</p>
                                <p className="text-xs">{app.admin_notes}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
