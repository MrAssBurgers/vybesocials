import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Lock, AlertTriangle, Users, Baby, Camera, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { usePageMeta } from '@/hooks/usePageMeta';

const pillars = [
  { icon: Shield, title: 'Vybe Check on every upload', body: 'Photos, videos, and audio are scanned by Gemini Flash and Google SafeSearch before they ever go live. Explicit material is blocked at upload time, not after a complaint. AI-generated content is auto-detected and watermarked.' },
  { icon: Baby, title: 'Strong protections for users under 13', body: 'Accounts under 13 cannot see explicit music, are excluded from personalized advertising, and have stricter AI content filters applied automatically. Parents can set a 4-digit PIN and screen-time intervals.' },
  { icon: Lock, title: 'Encrypted private messages', body: 'All direct messages are AES-256 encrypted at rest. Plaintext only ever lives on your device. Voice notes and call media are isolated in a Content Lifecycle Stream so even our admins cannot browse them.' },
  { icon: Eye, title: 'Anti-screenshot heuristics', body: 'When someone attempts to capture private content, our CaptureShield system detects it on supported devices and notifies the original poster. A 5-second cooldown prevents rapid-fire capture attempts.' },
  { icon: MessageSquareWarning, title: 'Two-tap blocking and reporting', body: 'Block, mute, or report any user from any context — feed, DM, profile, comment thread — in two taps. Reports are reviewed within 24 hours. Repeat offenders are removed from the platform.' },
  { icon: Camera, title: 'Hardware permissions are gestural', body: 'Camera, microphone, and location only activate after an explicit user gesture. The camera stream is always stopped before mode switches and incoming calls. No silent recording, ever.' },
  { icon: Users, title: 'Community-led moderation', body: 'Communities can apply their own AI strictness, appoint admins, and override platform defaults with group consensus. Bad actors are surfaced to moderators with full context.' },
  { icon: AlertTriangle, title: 'Self-healing bug reports', body: 'Crashes and errors are silently logged with consent so we can fix problems before users have to report them.' },
];

export default function SafetyPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const prev = document.title;
    document.title = 'Safety on VYBE | How We Protect Our Community';
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    meta?.setAttribute('content', 'Learn how VYBE keeps users safe: AI content scanning, encrypted DMs, parental protections for users under 13, blocking and reporting, and community-led moderation.');
    return () => {
      document.title = prev;
      if (prevDesc) meta?.setAttribute('content', prevDesc);
    };
  }, []);

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
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Your safety isn't a feature. It's the foundation.</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            VYBE was built from day one with safety, privacy, and protection for younger users baked into every layer. Here is exactly how we do it.
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
            See something dangerous? Report it inside the app from any post, message, or profile, or email{' '}
            <a href="mailto:vybesocial.info@gmail.com" className="text-primary hover:underline">vybesocial.info@gmail.com</a>{' '}
            for urgent matters. We aim to respond to safety reports within 24 hours.
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
