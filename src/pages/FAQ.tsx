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
    a: 'VYBE is a next-generation social app that combines a personality-driven feed (VYBE DNA), a real-time Friend Map, encrypted DMs, vertical clips, communities, and a built-in AI assistant. It is designed to feel less like a content firehose and more like a place that actually knows you.',
  },
  {
    q: 'Is VYBE free?',
    a: 'Yes. Creating an account, posting, messaging, and using all core social features are completely free. We also offer VYBE+ (Premium) for people who want extra customization, ad-free browsing, and creator-tier perks.',
  },
  {
    q: 'How is VYBE different from Instagram, Snapchat, or TikTok?',
    a: 'Three big differences. (1) Your feed is ranked by a personality vector you can actually see and edit, not by a hidden engagement model. (2) Friends-first geo-features like the Friend Map and live VYBE Spaces are built in, not bolted on. (3) Safety is enforced before content is published, not after — every upload is AI-scanned in real time.',
  },
  {
    q: 'Who can use VYBE?',
    a: 'VYBE is open to anyone 13 or older. Users under 13 are not permitted. Users 13–17 get stricter AI safety filters, no personalized advertising, and limited access to age-restricted music and content.',
  },
  {
    q: 'Is my data private? What about my DMs?',
    a: 'Direct messages are encrypted at rest using AES-256, and plaintext only exists on your device. We do not sell your personal information. You can read the full details in our Privacy Policy.',
  },
  {
    q: 'Can I delete my account?',
    a: 'Yes. You can delete your account instantly from Settings → Account, or from our public web form at /delete-account. Deletion removes your profile, posts, messages, and personal data within 30 days. A small set of records (e.g. transactions) is retained as required by tax and safety law.',
  },
  {
    q: 'How does the Friend Map work? Can I hide?',
    a: 'The Friend Map shows nearby friends with weather overlays so you can plan hangouts. Location is only shared with people you have approved as friends, refreshes once an hour, and you can turn on Ghost Mode at any moment to disappear from everyone\'s map until you choose to reappear.',
  },
  {
    q: 'What is VYBE DNA?',
    a: 'VYBE DNA is a 30-day rolling personality vector built from your reactions, saves, comments, and watch time. It powers your feed and recommendations, and you can see and edit it directly. As your taste changes, your DNA evolves with you.',
  },
  {
    q: 'How does VYBE moderate content?',
    a: 'Every photo, video, and audio upload is scanned by AI (Gemini Flash + Google SafeSearch) before it is published. Explicit content is blocked at the source. AI-generated media is auto-watermarked. Communities can layer on their own moderation rules. Reports from users are reviewed within 24 hours.',
  },
  {
    q: 'Are there ads on VYBE?',
    a: 'Not yet. When advertising rolls out it will be Google AdSense-based, clearly labeled, and sensitive categories (health, race, religion, sexual orientation, political affiliation) will not be used for targeting. Premium subscribers see no ads at all. Users under 13 are excluded from personalized advertising entirely.',
  },
  {
    q: 'How do creators make money on VYBE?',
    a: 'Creators can receive tips (85% goes to the creator), sell digital and physical goods through Stripe Connect, accept sponsored posts, and unlock revenue-share tiers based on engagement. Creator payouts run through Stripe.',
  },
  {
    q: 'Is VYBE on iOS and Android?',
    a: 'VYBE is a Progressive Web App today, installable from any modern mobile browser. Native iOS and Android builds are in active development.',
  },
  {
    q: 'How do I contact support?',
    a: 'Email us at vybesocial.info@gmail.com or use the in-app feedback button. We answer most messages within 1–2 business days.',
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
