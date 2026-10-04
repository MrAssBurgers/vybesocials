import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Lock, AlertTriangle, Users, UserRound, Camera, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { usePageMeta } from '@/hooks/usePageMeta';

const pillars = [
  { icon: Shield, title: 'Content checks and their limits', body: 'Supported publishing flows include automated content checks. These are not a guarantee that every file or message has been scanned or that harmful content will always be caught. Reporting tools remain available when something needs attention.' },
  { icon: UserRound, title: 'Profile privacy choices', body: 'Review your account privacy settings and choose who you connect with. Use a private community when you want people to join by invitation.' },
  { icon: Lock, title: 'Who can access a conversation', body: 'Conversation membership controls access to direct and group messages. VYBE DMs are not end-to-end encrypted: messages are processed and stored by VYBE services. Read the Privacy Policy for data handling details.' },
  { icon: Eye, title: 'Choose what you share', body: 'Check your audience before posting or sending a message. Disappearing content and privacy settings do not prevent a recipient from keeping a copy; screenshot detection is not guaranteed.' },
  { icon: MessageSquareWarning, title: 'Blocking and reporting', body: 'Use profile controls to block unwanted contact, and report content or accounts that break the Community Guidelines. Report response times are not guaranteed.' },
  { icon: Camera, title: 'Device permissions', body: 'Your device or browser controls access to the camera, microphone, and location. Review or revoke those permissions in its settings, and use Ghost Mode to turn off location sharing in VYBE.' },
  { icon: Users, title: 'Community moderation', body: 'Community owners can manage roles, appoint moderators, and set channel permissions. Private communities use invitations; channel access also applies to community voice rooms.' },
  { icon: AlertTriangle, title: 'Optional crash reports', body: 'VYBE asks before enabling optional crash reporting. You can decline and continue using the app, or review your choice in Settings.' },
];

export default function SafetyPage() {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Safety and Privacy Controls | VYBE',
    description: 'Explore VYBE privacy settings, blocking, reporting, device permissions, community moderation, and the limits of content checks and message privacy.',
    canonicalPath: '/safety',
  });

  return (
    <div className="page-scroll-fix bg-background">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold mb-4">
            <Shield className="w-3 h-3" /> Safety by design
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Know your controls. Choose how you connect.</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Learn how to manage privacy, report a problem, and look after your community — along with the limits of these tools.
          </p>
        </motion.header>

        <section className="space-y-4 mb-10">
          {pillars.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-5 flex gap-4"
            >
              <div className="shrink-0 w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <p.icon className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground mb-1">{p.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            </motion.article>
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 mb-10">
          <h2 className="text-xl font-bold mb-3">Reporting and emergencies</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Use in-app reporting controls or email{' '}
            <a href="mailto:vybesocial.info@gmail.com" className="text-primary hover:underline">vybesocial.info@gmail.com</a>{' '}
            with the content or account involved and what happened. This inbox is not an emergency service.
          </p>
          <p className="text-sm text-muted-foreground">
            For child safety concerns, please also see our{' '}
            <Link to="/child-safety" className="text-primary hover:underline">Child Safety Standards</Link>.
            For real-world emergencies, contact local emergency services first.
          </p>
        </section>

        <PublicFooter />
      </div>
    </div>
  );
}
