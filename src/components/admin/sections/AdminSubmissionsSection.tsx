import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, CheckCircle, XCircle, Clock, User, ChevronDown, ChevronUp, Sparkles, FileText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ───
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

interface CreatorApplication {
  id: string;
  user_id: string;
  applied_at: string | null;
  is_approved: boolean;
  tier: string;
  created_at: string;
  user?: { username: string; avatar_url: string | null; display_name: string | null };
}

// ─── Send rejection DM helper ───
async function sendRejectionDM(adminProfileId: string, targetUserId: string, type: 'moderator' | 'creator', reason: string) {
  try {
    const { data: conversationId } = await supabase.rpc('create_dm_conversation', {
      other_profile_id: targetUserId,
    });

    if (!conversationId) return;

    const typeLabel = type === 'moderator' ? 'Moderator' : 'Creator Partner';
    const message = `🔔 **${typeLabel} Application Update**\n\nYour application has been reviewed and was not accepted at this time.\n\n${reason ? `**Reason:** ${reason}` : 'Please continue engaging with the community and feel free to reapply in the future.'}\n\nKeep creating and growing! 💪`;

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: adminProfileId,
      content: message,
    });
  } catch (err) {
    console.error('Failed to send rejection DM:', err);
  }
}

// ─── Send acceptance DM helper ───
async function sendAcceptanceDM(adminProfileId: string, targetUserId: string, type: 'moderator' | 'creator') {
  try {
    const { data: conversationId } = await supabase.rpc('create_dm_conversation', {
      other_profile_id: targetUserId,
    });

    if (!conversationId) return;

    if (type === 'creator') {
      const message = `🎉 **Congratulations! You've Been Accepted as a VYBE Creator Partner!**\n\n` +
        `You're now part of the VYBE Creator Program and can start earning money from your content — just like YouTube and TikTok creators!\n\n` +
        `💰 **How You Earn:**\n` +
        `• **Ads** — 60% revenue share\n` +
        `• **Subscriptions** — 80% revenue share\n` +
        `• **Tips** — 85% revenue share\n` +
        `• **Brand Deals** — 75% revenue share\n\n` +
        `🏦 **Next Step:** Head to your **Creator Dashboard** and set up your payout method so you can get paid!\n\n` +
        `The more you create and engage, the more you earn. Welcome to the team! 🚀`;

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: adminProfileId,
        content: message,
      });
    } else {
      const message = `🎉 **Congratulations! You've Been Accepted as a Moderator!**\n\nYou now have moderator privileges. Use them wisely to keep the community safe and positive!\n\nWelcome to the team! 🛡️`;

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: adminProfileId,
        content: message,
      });
    }
  } catch (err) {
    console.error('Failed to send acceptance DM:', err);
  }
}

// ─── Mod Applications Tab ───
function ModApplicationsTab() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['admin-mod-applications', filter],
    queryFn: async () => {
      let query = supabase
        .from('moderator_applications')
        .select('*, applicant:profiles!user_id(username, avatar_url, display_name)')
        .order('created_at', { ascending: false });
      if (filter === 'pending') query = query.eq('status', 'pending');
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ModApplication[];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: 'approved' | 'rejected'; notes?: string }) => {
      const { error } = await supabase
        .from('moderator_applications')
        .update({
          status,
          admin_notes: notes || null,
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;

      const app = applications.find(a => a.id === id);
      if (!app) return;

      if (status === 'approved') {
        await supabase
          .from('user_roles')
          .upsert({ user_id: app.user_id, role: 'moderator' }, { onConflict: 'user_id,role' });
        if (profile?.id) {
          await sendAcceptanceDM(profile.id, app.user_id, 'moderator');
        }
      } else if (status === 'rejected' && profile?.id) {
        await sendRejectionDM(profile.id, app.user_id, 'moderator', notes || '');
      }
    },
    onSuccess: (_, vars) => {
      toast.success(`Application ${vars.status}!`);
      queryClient.invalidateQueries({ queryKey: ['admin-mod-applications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-submissions-count'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Mod Applications</span>
          {pendingCount > 0 && <Badge className="bg-primary/20 text-primary text-xs">{pendingCount}</Badge>}
        </div>
        <div className="flex gap-1.5">
          <Button variant={filter === 'pending' ? 'default' : 'outline'} size="sm" className="text-xs rounded-lg h-7" onClick={() => setFilter('pending')}>Pending</Button>
          <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" className="text-xs rounded-lg h-7" onClick={() => setFilter('all')}>All</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : applications.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No {filter === 'pending' ? 'pending ' : ''}applications</p>
        </GlassCard>
      ) : (
        <ApplicationsList
          applications={applications}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          adminNotes={adminNotes}
          setAdminNotes={setAdminNotes}
          onReview={(id, status, notes) => reviewMutation.mutate({ id, status, notes })}
          isPending={reviewMutation.isPending}
          type="mod"
        />
      )}
    </div>
  );
}

// ─── Creator Applications Tab ───
function CreatorApplicationsTab() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['admin-creator-applications', filter],
    queryFn: async () => {
      let query = supabase
        .from('creator_profiles')
        .select('*, user:profiles!user_id(username, avatar_url, display_name)')
        .not('applied_at', 'is', null)
        .order('applied_at', { ascending: false });
      if (filter === 'pending') query = query.eq('is_approved', false);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CreatorApplication[];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, userId, status, notes }: { id: string; userId: string; status: 'approved' | 'rejected'; notes?: string }) => {
      if (status === 'approved') {
        const { error } = await supabase
          .from('creator_profiles')
          .update({
            is_approved: true,
            approved_at: new Date().toISOString(),
            tier: 'emerging',
          })
          .eq('id', id);
        if (error) throw error;

        // Send acceptance DM with monetization info
        if (profile?.id) {
          await sendAcceptanceDM(profile.id, userId, 'creator');
        }
      } else {
        // Delete the creator profile so they can reapply
        const { error } = await supabase
          .from('creator_profiles')
          .delete()
          .eq('id', id);
        if (error) throw error;

        if (profile?.id) {
          await sendRejectionDM(profile.id, userId, 'creator', notes || '');
        }
      }
    },
    onSuccess: (_, vars) => {
      toast.success(`Creator application ${vars.status}!`);
      queryClient.invalidateQueries({ queryKey: ['admin-creator-applications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-submissions-count'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pendingCount = applications.filter(a => !a.is_approved).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Creator Applications</span>
          {pendingCount > 0 && <Badge className="bg-primary/20 text-primary text-xs">{pendingCount}</Badge>}
        </div>
        <div className="flex gap-1.5">
          <Button variant={filter === 'pending' ? 'default' : 'outline'} size="sm" className="text-xs rounded-lg h-7" onClick={() => setFilter('pending')}>Pending</Button>
          <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" className="text-xs rounded-lg h-7" onClick={() => setFilter('all')}>All</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : applications.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No {filter === 'pending' ? 'pending ' : ''}creator applications</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {applications.map((app) => {
              const isExpanded = expandedId === app.id;
              const isPending = !app.is_approved;
              return (
                <motion.div key={app.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <GlassCard className="overflow-hidden">
                    <button onClick={() => setExpandedId(isExpanded ? null : app.id)} className="w-full flex items-center justify-between p-3.5 text-left">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                          {app.user?.avatar_url ? (
                            <img src={app.user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <User className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{app.user?.display_name || app.user?.username || 'Unknown'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Applied {app.applied_at ? formatDistanceToNow(new Date(app.applied_at), { addSuffix: true }) : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${app.is_approved ? 'text-green-400 border-green-500/30' : 'text-amber-400 border-amber-500/30'}`}>
                          {app.is_approved ? <><CheckCircle className="h-3 w-3 mr-1" />Approved</> : <><Clock className="h-3 w-3 mr-1" />Pending</>}
                        </Badge>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/30 pt-3">
                            <div className="text-xs text-muted-foreground">
                              Tier: <span className="text-foreground font-medium capitalize">{app.tier || 'none'}</span>
                            </div>

                            {isPending && (
                              <div className="space-y-2 pt-2">
                                <Textarea
                                  placeholder="Rejection reason (sent to applicant via DM)"
                                  value={adminNotes[app.id] || ''}
                                  onChange={(e) => setAdminNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                  className="min-h-[60px] text-xs bg-background/50"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1 gap-1.5 rounded-xl text-xs bg-green-600 hover:bg-green-700"
                                    onClick={() => reviewMutation.mutate({ id: app.id, userId: app.user_id, status: 'approved' })}
                                    disabled={reviewMutation.isPending}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="flex-1 gap-1.5 rounded-xl text-xs"
                                    onClick={() => reviewMutation.mutate({ id: app.id, userId: app.user_id, status: 'rejected', notes: adminNotes[app.id] })}
                                    disabled={reviewMutation.isPending}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Reject
                                  </Button>
                                </div>
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

// ─── Shared Application List (for mod apps) ───
function ApplicationsList({
  applications, expandedId, setExpandedId, adminNotes, setAdminNotes, onReview, isPending, type,
}: {
  applications: ModApplication[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  adminNotes: Record<string, string>;
  setAdminNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onReview: (id: string, status: 'approved' | 'rejected', notes?: string) => void;
  isPending: boolean;
  type: 'mod';
}) {
  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved': return <Badge variant="outline" className="text-green-400 border-green-500/30 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {applications.map((app) => {
          const isExpanded = expandedId === app.id;
          return (
            <motion.div key={app.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <GlassCard className="overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : app.id)} className="w-full flex items-center justify-between p-3.5 text-left">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {app.applicant?.avatar_url ? (
                        <img src={app.applicant.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <User className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{app.applicant?.display_name || app.applicant?.username || 'Unknown'}</p>
                      <p className="text-[10px] text-muted-foreground">Applied {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(app.status)}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
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
                              placeholder="Rejection reason (sent to applicant via DM)"
                              value={adminNotes[app.id] || ''}
                              onChange={(e) => setAdminNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                              className="min-h-[60px] text-xs bg-background/50"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="flex-1 gap-1.5 rounded-xl text-xs bg-green-600 hover:bg-green-700" onClick={() => onReview(app.id, 'approved', adminNotes[app.id])} disabled={isPending}>
                                <CheckCircle className="h-3.5 w-3.5" />Approve
                              </Button>
                              <Button size="sm" variant="destructive" className="flex-1 gap-1.5 rounded-xl text-xs" onClick={() => onReview(app.id, 'rejected', adminNotes[app.id])} disabled={isPending}>
                                <XCircle className="h-3.5 w-3.5" />Reject
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
  );
}

// ─── Main Section ───
export function AdminSubmissionsSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Submissions</h2>
      </div>

      <Tabs defaultValue="mod" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="mod" className="flex-1 gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Moderators
          </TabsTrigger>
          <TabsTrigger value="creator" className="flex-1 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Creators
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mod" className="mt-3">
          <ModApplicationsTab />
        </TabsContent>

        <TabsContent value="creator" className="mt-3">
          <CreatorApplicationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
