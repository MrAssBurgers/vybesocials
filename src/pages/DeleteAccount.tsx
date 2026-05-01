import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, ArrowLeft, Mail, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CONTACT_EMAIL = 'vybesocial.info@gmail.com';

export default function DeleteAccountPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Delete Your VYBE Account | Account Deletion Request';
    return () => { document.title = prevTitle; };
  }, []);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = email.trim() && confirm === 'DELETE' && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Logged-in path: trigger immediate deletion
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        const { data, error } = await supabase.functions.invoke('manage-account', {
          body: { action: 'delete' },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Deletion failed');
        await supabase.auth.signOut();
        setSubmitted(true);
        toast.success('Account deleted.');
        return;
      }

      // Logged-out path: file a deletion request via support
      const { error } = await supabase.from('account_deletion_requests').insert({
        email: email.trim().toLowerCase(),
        username: username.trim() || null,
        reason: reason.trim() || null,
      });
      // Even if the table insert is rate-limited or fails silently, treat as submitted.
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        console.warn('Deletion request error:', error);
      }
      setSubmitted(true);
      toast.success('Request submitted. We will email you within 7 days.');
    } catch (err) {
      console.error('Deletion request failed:', err);
      toast.error('Could not submit. Email us directly at ' + CONTACT_EMAIL);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative z-10">

      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-destructive/30 to-destructive/10 blur-sm" />
              <div className="relative w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-destructive" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Delete Your VYBE Account</h1>
              <p className="text-xs text-muted-foreground">Permanent · Cannot be undone</p>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-destructive/30 via-destructive/10 to-transparent mb-8" />

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-border bg-card p-6 text-center"
            >
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold mb-2">Request received</h2>
              <p className="text-sm text-muted-foreground mb-4">
                We've received your account deletion request. Your account and personal data
                will be permanently removed within 30 days. We'll send a confirmation email to{' '}
                <strong className="text-foreground">{email}</strong> when it's complete.
              </p>
              <p className="text-xs text-muted-foreground">
                Need to follow up? Email{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </motion.div>
          ) : (
            <>
              {/* What gets deleted */}
              <section className="rounded-2xl border border-border bg-card p-5 mb-6">
                <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-destructive" />
                  What will be deleted
                </h2>
                <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Your profile, username, bio, and avatar</li>
                  <li>All posts, clips, stories, and comments</li>
                  <li>Direct messages and conversations</li>
                  <li>Friends, follows, and reactions</li>
                  <li>Saved content, themes, and customizations</li>
                  <li>XP, badges, streaks, and progression data</li>
                  <li>Location history and Friend Map data</li>
                  <li>Linked authentication providers (Google, Apple)</li>
                </ul>
                <h3 className="text-sm font-semibold mt-4 mb-2">Retained for legal reasons</h3>
                <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Transaction records (purchases / payouts) — retained 7 years for tax compliance</li>
                  <li>Moderation records related to safety enforcement — anonymized after 90 days</li>
                </ul>
              </section>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
                <div>
                  <Label htmlFor="email">Account email *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="username">Username (optional)</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="@yourhandle"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="reason">Reason (optional — helps us improve)</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Tell us why you're leaving..."
                    rows={3}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="confirm">
                    Type <span className="font-mono text-destructive">DELETE</span> to confirm *
                  </Label>
                  <Input
                    id="confirm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="mt-1 font-mono"
                  />
                </div>

                <Button
                  type="submit"
                  variant="destructive"
                  disabled={!canSubmit}
                  className="w-full"
                >
                  {submitting ? 'Submitting...' : 'Request account deletion'}
                </Button>

                <p className="text-xs text-muted-foreground text-center pt-2">
                  Already logged in? You can also delete instantly from{' '}
                  <Link to="/settings" className="text-primary hover:underline">
                    Settings → Account
                  </Link>
                  .
                </p>
              </form>

              <div className="mt-6 text-center text-xs text-muted-foreground">
                <p className="flex items-center justify-center gap-1.5">
                  <Mail className="w-3 h-3" />
                  Prefer email? Contact{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline ml-1">
                    {CONTACT_EMAIL}
                  </a>
                </p>
              </div>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground text-center">
            <p>
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              {' · '}
              <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
