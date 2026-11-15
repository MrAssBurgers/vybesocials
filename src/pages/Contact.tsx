import { Link } from 'react-router-dom';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { Mail, Shield, HelpCircle, FileText, Users } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

const faqs = [
  {
    question: 'How do I create an account?',
    answer: 'You can sign up for VYBE using your email address, Google account, or Apple ID. After signing up, you\'ll complete a brief onboarding process to set up your profile, choose your interests, and customize your experience.',
  },
  {
    question: 'I forgot my password. How do I reset it?',
    answer: 'On the sign-in page, click "Forgot password?" and enter your email address. You\'ll receive a password reset link. If you signed up with Google or Apple, use those sign-in options instead.',
  },
  {
    question: 'How do I report inappropriate content?',
    answer: 'Use the Report option on a post, message, or profile to flag content or unwanted contact. Report response times are not guaranteed. You can also contact the safety team at the email address below.',
  },
  {
    question: 'What is VYBE Premium?',
    answer: 'Core posting, messaging, and community features are free. Paid subscriptions are not currently available. Some profile items have in-app token or level requirements, shown when you select them.',
  },
  {
    question: 'How does the Creator Program work?',
    answer: 'Creators can share posts and clips, build communities, and make games, tools, or art in Mini App Studio. Cash tips and creator payouts are not currently available. In-app tokens are for supported profile items and are not a cash balance.',
  },
  {
    question: 'How do I delete my account or request my data?',
    answer: 'Sign in to manage a deletion request in Settings or on the Account deletion request page. Requests have a 30-day grace period before review. Permanent cleanup is not automatic yet. For deletion follow-up or a data request, contact the support email below.',
  },
  {
    question: 'Is my data safe on VYBE?',
    answer: 'Conversation membership controls access to messages, but VYBE DMs are not end-to-end encrypted. Messages are processed and stored by VYBE services. Review your privacy settings and read the Privacy Policy for data handling details.',
  },
  {
    question: 'How do Communities work?',
    answer: 'Communities are group spaces organized around shared interests. Each community has channels for different topics, voice rooms for live conversations, and moderation tools to keep discussions productive and safe.',
  },
];

export default function Contact() {
  usePageMeta({
    title: 'Contact & Support | VYBE',
    description: 'Get in touch with the VYBE team. Help with your account, safety reports, press inquiries, partnerships, and answers to common questions.',
    canonicalPath: '/contact',
  });
  return (
    <div className="page-scroll-fix bg-background">
      {/* Header */}
      <header
        className="border-b border-border/50 sticky top-0 z-50 bg-background/80 backdrop-blur-xl"
        style={{ paddingTop: 'var(--sat, 0px)' }}
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex min-h-11 items-center gap-2">
            <VYBELogo size="sm" />
          </Link>
          <nav aria-label="Public navigation" className="flex items-center gap-1 sm:gap-2 text-sm text-muted-foreground">
            <Link to="/about" className="inline-flex min-h-11 items-center rounded-lg px-2 hover:text-foreground transition-colors">About</Link>
            <Link to="/contact" aria-current="page" className="inline-flex min-h-11 items-center rounded-lg px-2 text-foreground font-medium">Contact</Link>
            <Link to="/login" className="inline-flex min-h-11 items-center rounded-lg px-2 text-primary font-medium hover:underline">Sign In</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground mb-4">
            Contact Us
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Have a question, need help, or want to share feedback? We're here for you. Reach out through any of the channels below.
          </p>
        </div>
      </section>

      {/* Contact Info */}
      <section className="py-8 px-4 border-t border-border/30">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border/50 p-5 bg-card/50">
            <Mail className="w-7 h-7 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">General Support</h3>
            <p className="text-sm text-muted-foreground mb-2">For account issues, bug reports, and general questions.</p>
            <a href="mailto:vybesocial.info@gmail.com" className="text-sm text-primary hover:underline font-medium">
              vybesocial.info@gmail.com
            </a>
          </div>
          <div className="rounded-xl border border-border/50 p-5 bg-card/50">
            <Shield className="w-7 h-7 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Safety & Moderation</h3>
            <p className="text-sm text-muted-foreground mb-2">Report urgent safety concerns or content violations.</p>
            <a href="mailto:vybesocial.info@gmail.com" className="text-sm text-primary hover:underline font-medium">
              vybesocial.info@gmail.com
            </a>
          </div>
          <div className="rounded-xl border border-border/50 p-5 bg-card/50">
            <Users className="w-7 h-7 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Business & Partnerships</h3>
            <p className="text-sm text-muted-foreground mb-2">For creator partnerships, advertising, and business inquiries.</p>
            <a href="mailto:vybesocial.info@gmail.com" className="text-sm text-primary hover:underline font-medium">
              vybesocial.info@gmail.com
            </a>
          </div>
          <div className="rounded-xl border border-border/50 p-5 bg-card/50">
            <FileText className="w-7 h-7 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Data & Privacy Requests</h3>
            <p className="text-sm text-muted-foreground mb-2">Data export, deletion requests, and GDPR inquiries.</p>
            <a href="mailto:vybesocial.info@gmail.com" className="text-sm text-primary hover:underline font-medium">
              vybesocial.info@gmail.com
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 px-4 border-t border-border/30">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-8">
            <HelpCircle className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-display font-bold text-foreground">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <details key={i} className="rounded-xl border border-border/50 bg-card/50 group">
                <summary className="p-4 cursor-pointer font-medium text-foreground flex items-center justify-between hover:bg-accent/30 rounded-xl transition-colors">
                  {faq.question}
                  <span className="text-muted-foreground text-lg ml-2 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
              </details>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link to="/faq" className="inline-flex min-h-11 items-center text-primary hover:underline">More questions & answers</Link>
            <Link to="/features" className="inline-flex min-h-11 items-center text-primary hover:underline">Features & availability</Link>
            <Link to="/delete-account" className="inline-flex min-h-11 items-center text-primary hover:underline">Account deletion request</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-4 mt-8">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Use</Link>
            <Link to="/guidelines" className="hover:text-foreground transition-colors">Community Guidelines</Link>
            <Link to="/cookies" className="hover:text-foreground transition-colors">Cookie Policy</Link>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Vybe Studios. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
