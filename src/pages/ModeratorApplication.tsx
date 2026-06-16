import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft, Send, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const RESPONSIBILITIES = [
  '🛡️ Review and act on DM reports to keep users safe',
  '🚫 Identify and remove predators, pedophiles, and dangerous accounts',
  '🐛 Report bugs and app issues directly to the owner',
  '💡 Suggest new features and improvements you want to see',
  '⚖️ Enforce community guidelines fairly and consistently',
  '📢 Escalate serious safety concerns immediately',
];

export default function ModeratorApplication() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [experience, setExperience] = useState('');
  const [availability, setAvailability] = useState('');

  // Check existing application
  const { data: existingApp, isLoading } = useQuery({
    queryKey: ['mod-application', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await db
        .from('moderator_applications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Not authenticated');
      const { error } = await db
        .from('moderator_applications')
        .insert({
          user_id: profile.id,
          reason: reason.trim(),
          experience: experience.trim() || null,
          availability: availability.trim() || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Application submitted! We\'ll review it soon.');
      queryClient.invalidateQueries({ queryKey: ['mod-application'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit application');
    },
  });

  const canSubmit = reason.trim().length >= 50;
  const hasPending = existingApp?.status === 'pending';
  const wasApproved = existingApp?.status === 'approved';
  const wasRejected = existingApp?.status === 'rejected';

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Apply for Moderator</h1>
            <p className="text-xs text-muted-foreground">Help keep VYBE safe</p>
          </div>
        </div>

        {/* Responsibilities Card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <GlassCard className="p-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-sm">What Moderators Do</h2>
            </div>
            <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive/90">
                This role involves reviewing sensitive & disturbing content. You must be 18+ and comfortable handling reports of abuse, harassment, and predatory behavior.
              </p>
            </div>
            <ul className="space-y-2">
              {RESPONSIBILITIES.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground leading-relaxed">{item}</li>
              ))}
            </ul>
          </GlassCard>
        </motion.div>

        {/* Status banner if already applied */}
        {hasPending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-5">
            <Clock className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-300">Application Pending</p>
              <p className="text-xs text-muted-foreground">We're reviewing your application. Hang tight!</p>
            </div>
          </motion.div>
        )}

        {wasApproved && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 mb-5">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-300">Application Approved! 🎉</p>
              <p className="text-xs text-muted-foreground">You've been granted moderator access.</p>
            </div>
          </motion.div>
        )}

        {wasRejected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 mb-5">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Application Not Accepted</p>
              <p className="text-xs text-muted-foreground">
                {existingApp?.admin_notes || 'You can reapply after some time.'}
              </p>
            </div>
          </motion.div>
        )}

        {/* Application Form - show if no pending app */}
        {!hasPending && !wasApproved && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <GlassCard className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Why would you be a good moderator? <span className="text-destructive">*</span>
                </label>
                <Textarea
                  placeholder="Tell us why you'd be great at keeping VYBE safe. What makes you trustworthy? How would you handle difficult situations? (min 50 characters)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-[120px] bg-background/50 border-border/50 text-sm"
                  maxLength={2000}
                />
                <p className="text-[10px] text-muted-foreground/50 mt-1 text-right">
                  {reason.length}/2000 {reason.length < 50 && reason.length > 0 && '(min 50)'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Any moderation experience?</label>
                <Textarea
                  placeholder="Discord mod, Reddit mod, community admin, etc. (optional)"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="min-h-[80px] bg-background/50 border-border/50 text-sm"
                  maxLength={1000}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Availability</label>
                <Textarea
                  placeholder="How often can you check reports? What timezone are you in? (optional)"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  className="min-h-[60px] bg-background/50 border-border/50 text-sm"
                  maxLength={500}
                />
              </div>

              <Button
                onClick={() => submitMutation.mutate()}
                disabled={!canSubmit || submitMutation.isPending}
                className="w-full rounded-xl gap-2"
              >
                <Send className="h-4 w-4" />
                {submitMutation.isPending ? 'Submitting...' : 'Submit Application'}
              </Button>
            </GlassCard>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
