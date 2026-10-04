import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { usePageMeta } from '@/hooks/usePageMeta';

const faqs = [
  {
    q: 'What is VYBE?',
    a: 'VYBE brings posts, stories, clips, conversations, and communities together. Make your profile your own with themes and backgrounds, or build a small game, tool, or art experience in Mini App Studio.',
  },
  {
    q: 'Is VYBE free?',
    a: 'Creating an account and using core posting, messaging, and community features is free. Paid subscriptions are not currently available. Some profile items have in-app token or level requirements, shown when you select them.',
  },
  {
    q: 'What can I make on VYBE?',
    a: 'Share a post, clip, or story; start a community around an interest; or customize your profile. Mini App Studio also lets you edit HTML, CSS, and JavaScript, preview your idea, and publish a version to the Hub.',
  },
  {
    q: 'Who can use VYBE?',
    a: 'VYBE is for people 13 or older. Users under 13 are not permitted. See the Terms and Community Guidelines for account and content requirements.',
  },
  {
    q: 'Is my data private? What about my DMs?',
    a: 'Conversation membership controls access to direct and group messages, but VYBE DMs are not end-to-end encrypted. Messages are processed and stored by VYBE services. You can manage profile privacy and block accounts in the app; see the Privacy Policy for data handling details.',
  },
  {
    q: 'Can I delete my account?',
    a: 'Yes. You can delete your account instantly from Settings → Account, or from our public web form at /delete-account. Deletion removes your profile, posts, messages, and personal data within 30 days. A small set of records (e.g. transactions) is retained as required by tax and safety law.',
  },
  {
    q: 'How does the Friend Map work? Can I hide?',
    a: 'The Friend Map lets you explore shared friend locations. Location sharing depends on your device permissions and settings. Use Ghost Mode to turn sharing off, and review those settings before sharing your location.',
  },
  {
    q: 'What is VYBE DNA?',
    a: 'VYBE DNA is an activity-inspired visual identity on your profile, with colors, patterns, and interests. It gives you another way to explore and show your interests alongside your posts.',
  },
  {
    q: 'How does VYBE moderate content?',
    a: 'Community Guidelines apply to posts, messages, and communities. Use reporting and blocking controls when you encounter unwanted content or contact. Automated checks in supported publishing flows do not guarantee that every file or message has been scanned, and there is no guaranteed report response time.',
  },
  {
    q: 'Are there ads on VYBE?',
    a: 'Paid ad campaigns are not currently available, and rewarded ads cannot currently be used to earn VYBE tokens.',
  },
  {
    q: 'Can creators earn cash on VYBE?',
    a: 'Cash tips, creator payouts, and paid subscriptions are not currently available. In-app tokens can be used for supported profile items; they are not a cash balance or a promise of future income.',
  },
  {
    q: 'Can I connect a game to VYBE?',
    a: 'The Game SDK is a developer preview for screenshots and short clips. It requires a reviewed game registration and deployed capture services. A player approves the connection, receives a private capture draft, and decides whether to publish it. The developer guide covers the setup and API.',
  },
  {
    q: 'Is VYBE on iOS and Android?',
    a: 'VYBE is a Progressive Web App today, installable from any modern mobile browser. Native iOS and Android builds are in active development.',
  },
  {
    q: 'How do I contact support?',
    a: 'Email vybesocial.info@gmail.com or use the in-app feedback tools. Include the problem and the steps that led to it so it can be investigated.',
  },
];

export default function FAQPage() {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Frequently Asked Questions | VYBE',
    description: 'Answers to the most common questions about VYBE: account, privacy, the Friend Map, VYBE DNA, moderation, monetization, and more.',
    canonicalPath: '/faq',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  });

  return (
    <div className="page-scroll-fix bg-background">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
            <HelpCircle className="w-3 h-3" /> FAQ
          </div>
          <h1 className="text-4xl font-bold mb-3">Frequently asked questions</h1>
          <p className="text-muted-foreground">
            Everything you might want to know before you sign up — or while you're here.
          </p>
        </motion.header>

        <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card divide-y divide-border">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="px-5 border-0">
              <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link to="/mini-apps" className="inline-flex min-h-11 items-center text-primary hover:underline">Open Mini App Studio</Link>
          <Link to="/developers" className="inline-flex min-h-11 items-center text-primary hover:underline">Read the developer guide</Link>
        </div>

        <p className="text-sm text-muted-foreground mt-6 text-center">
          Still stuck? <Link to="/contact" className="text-primary hover:underline">Contact us →</Link>
        </p>

        <div className="mt-12">
          <PublicFooter />
        </div>
      </div>
    </div>
  );
}
