import { motion } from 'framer-motion';
import { FileText, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';

const CONTACT_EMAIL = 'vybesocial.info@gmail.com';
const EFFECTIVE_DATE = 'February 16, 2026';
const TOS_VERSION = '2.0';

const sections = [
  { num: '01', title: 'Acceptance of Terms', content: `By creating an account or using VYBE ("the Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Platform. You must be at least 13 years of age to use VYBE. By creating an account, you represent and warrant that you meet this age requirement. Users under 16 may have restricted access to certain features as determined by VYBE's safety tier system.\n\nWe may update these Terms from time to time. When we make material changes, we will notify you through the app or via email. Your continued use of VYBE after such changes constitutes your acceptance of the updated Terms. We may require you to re-accept updated Terms before continuing to use the Platform.` },
  { num: '02', title: 'User Accounts & Responsibilities', content: 'You are responsible for maintaining the confidentiality and security of your account credentials and for all activities that occur under your account. You must provide accurate, current, and complete information during registration and keep your account information updated. You may not share your account with others, create multiple accounts, or transfer your account to another person.' },
  { num: '03', title: 'Prohibited Content & Conduct', content: 'You agree not to post, share, or transmit content that is illegal, harmful, threatening, abusive, harassing, defamatory, or obscene; contains sexually explicit material involving minors; promotes hate speech, violence, or discrimination; contains graphic violence or gore; promotes scams, fraud, phishing, or other deceptive practices; infringes on the intellectual property rights of others; or contains malware, viruses, or other harmful code.\n\nYou also agree not to impersonate other users or entities, spam or harass others, attempt to access unauthorized areas of the Platform, scrape or crawl data, use VYBE for illegal purposes, or circumvent Platform safety features.' },
  { num: '04', title: 'Content Moderation & AI Analysis', content: 'VYBE uses AI-assisted tools to analyze content for community guideline compliance. These AI systems are probabilistic in nature and may not always produce accurate results. AI analysis does not constitute a legal or factual determination. You remain solely responsible for the content you post, regardless of AI scan results. VYBE is not liable for any errors, false positives, or false negatives produced by automated content analysis.\n\nWe reserve the right to review, remove, or restrict any content at our sole discretion. Content decisions are logged and may be appealed through the Platform\'s appeal process.' },
  { num: '05', title: 'Intellectual Property', content: 'You retain all ownership rights to the content you create and post on VYBE. By posting content, you grant VYBE a worldwide, non-exclusive, royalty-free license to use, display, reproduce, and distribute your content within the Platform and for promotional purposes. This license ends when you delete your content or account, except for copies that have been shared by others or cached in backups.\n\nVYBE\'s name, logo, design, code, and branding are protected by intellectual property laws and may not be used without our written permission.' },
  { num: '06', title: 'DMCA & Copyright Takedown', content: `VYBE respects the intellectual property rights of others and complies with the Digital Millennium Copyright Act (DMCA). If you believe your copyrighted work has been infringed, you may submit a DMCA takedown notice to ${CONTACT_EMAIL} including: (a) identification of the copyrighted work, (b) identification of the infringing material and its location on VYBE, (c) your contact information, (d) a statement of good faith belief, and (e) a statement under penalty of perjury that you are authorized to act on behalf of the copyright owner.\n\nRepeat Infringer Policy: VYBE will terminate the accounts of users who are found to be repeat infringers of copyrighted material.` },
  { num: '07', title: 'Creator Monetization', content: 'VYBE offers monetization features for eligible creators through the Creator Partner Program. Revenue splits are as follows: Ad Revenue (Creator 60%, VYBE 40%), Subscriptions (Creator 80%, VYBE 20%), and Tips (Creator 85%, VYBE 15%). These splits are subject to change with notice.\n\nNo Earnings Guarantee: VYBE does not guarantee any level of income, earnings, or revenue from the Platform. Payouts are processed through Stripe Connect and subject to applicable tax laws. Creators are responsible for their own tax reporting obligations.' },
  { num: '08', title: 'Account Suspension & Termination', content: 'We may suspend or terminate your account at any time, with or without notice, if you violate these Terms or for any other reason at our sole discretion. You may delete your account at any time through Settings. Upon termination, your right to use VYBE ceases immediately. We may retain certain data as required by law or for legitimate business purposes.' },
  { num: '09', title: 'Disclaimer of Warranties', content: 'VYBE is provided "as is" and "as available" without warranties of any kind, whether express or implied. We do not guarantee that the Platform will be uninterrupted, error-free, secure, or continuously available. We do not guarantee the accuracy of AI-assisted content analysis.' },
  { num: '10', title: 'Limitation of Liability', content: 'To the maximum extent permitted by applicable law, VYBE and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.' },
  { num: '11', title: 'Dispute Resolution', content: 'Any disputes arising from these Terms or your use of VYBE shall be resolved through binding arbitration rather than in court. You agree to waive your right to a jury trial and to participate in class action lawsuits. Small claims court actions are exempt from this arbitration requirement.' },
];

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="page-scroll-fix bg-background relative z-10" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 blur-sm" />
              <div className="relative w-12 h-12 rounded-xl bg-card/80 backdrop-blur-sm border border-border/30 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Terms of Service</h1>
              <p className="text-xs text-muted-foreground">Effective: {EFFECTIVE_DATE} · Version {TOS_VERSION}</p>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-primary/30 via-primary/10 to-transparent mb-8" />

          {/* Sections */}
          <div className="space-y-6">
            {sections.map((s, i) => (
              <motion.section
                key={s.num}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group"
              >
                <div className="flex items-start gap-3 mb-2">
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center text-xs font-bold text-primary">
                    {s.num}
                  </span>
                  <h2 className="text-base font-semibold text-foreground pt-1">{s.title}</h2>
                </div>
                <div className="ml-11">
                  {s.content.split('\n\n').map((p, j) => (
                    <p key={j} className="text-sm text-muted-foreground mb-2 leading-relaxed">{p}</p>
                  ))}
                </div>
              </motion.section>
            ))}

            {/* Contact */}
            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <div className="flex items-start gap-3 mb-2">
                <span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center text-xs font-bold text-primary">12</span>
                <h2 className="text-base font-semibold text-foreground pt-1">Contact</h2>
              </div>
              <div className="ml-11">
                <p className="text-sm text-muted-foreground mb-3">For questions about these Terms, please contact us:</p>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/30 text-primary text-sm font-medium hover:bg-card transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  {CONTACT_EMAIL}
                </a>
              </div>
            </motion.section>
          </div>

          <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
            <p>See also: <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
