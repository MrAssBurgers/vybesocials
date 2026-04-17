import { motion } from 'framer-motion';
import { Shield, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';

const CONTACT_EMAIL = 'vybesocial.info@gmail.com';
const EFFECTIVE_DATE = 'February 16, 2026';
const PRIVACY_VERSION = '2.0';

const sections = [
  { num: '01', title: 'Information We Collect', content: 'We collect the following categories of information:\n\n• Account Information: Username, email address, date of birth, profile photo, bio, and display name\n• Content: Posts, messages, comments, media you upload, and interactions with other users\n• Usage Data: Feature usage patterns, app interactions, session duration, and navigation paths\n• Device Information: Device type, operating system, browser type, IP address, and device identifiers\n• Payment Information: Processed securely through Stripe; we do not store full payment card details\n• AI Processing Data: Content submitted for AI safety analysis — processed in real-time and not stored after analysis' },
  { num: '02', title: 'How We Use Your Information', content: '• Provide and improve VYBE\'s features and services\n• Personalize your experience (feed, recommendations, safety settings)\n• Enforce community guidelines through AI-assisted and human moderation\n• Process payments and creator monetization\n• Send notifications and service communications\n• Detect and prevent fraud, abuse, and security threats\n• Comply with legal obligations' },
  { num: '03', title: 'AI Processing Disclosure', content: 'VYBE uses AI-powered systems to analyze uploaded media and text for community guideline compliance. This processing is probabilistic and automated. AI analysis results do not constitute legal or factual determinations. Content submitted for AI analysis is processed in real-time and is not retained after the analysis is complete. You may appeal automated decisions through the Platform\'s appeal process.' },
  { num: '04', title: 'Data Sharing & Third Parties', content: 'We do not sell your personal information to third parties. We may share data with:\n\n• Service Providers: Stripe (payments), cloud hosting, analytics tools, and AI processing services\n• Advertising Partners: Google AdSense and its certified partners may set and read cookies, use web beacons, and collect IP addresses on your device to serve and measure ads. Learn how Google uses this data: https://policies.google.com/technologies/partner-sites\n• Legal Obligations: When required by law, regulation, or legal process\n• Safety: To protect the rights, safety, or property of VYBE, our users, or the public\n• Business Transfers: In connection with a merger, acquisition, or sale of assets\n\nYour public profile and posts are visible to other VYBE users. Private account content is visible only to approved followers.' },
  { num: '05', title: 'Data Retention', content: 'We retain your account data for as long as your account is active. Posts are retained for 25 days unless deleted sooner. Messages are retained for the duration of the conversation. If you delete your account, we will remove your personal data within 30 days, except where retention is required by law or for legitimate business purposes.' },
  { num: '06', title: 'Cookies & Tracking', content: 'We use cookies and similar technologies to maintain your session, remember your preferences, and understand how you use VYBE. Essential cookies are required for the Platform to function. Analytics cookies help us improve the Platform.\n\nThird-Party Advertising Cookies: When ads are enabled, Google AdSense and other third-party vendors may place cookies on your browser to serve ads based on your visits to VYBE and other sites on the Internet. You can opt out of personalized advertising by visiting Google Ads Settings (https://adssettings.google.com) or the Digital Advertising Alliance opt-out page (https://www.aboutads.info/choices). You can also manage cookie preferences in your browser settings.' },
  { num: '07', title: 'Your Rights (GDPR & Global)', content: 'Depending on your location, you may have the following rights regarding your personal data:\n\n• Access: Request a copy of your personal data\n• Correction: Request correction of inaccurate data\n• Deletion: Request deletion of your account and data via Settings\n• Data Portability: Request an export of your data in a machine-readable format\n• Restriction: Request restriction of processing in certain circumstances\n• Objection: Object to processing based on legitimate interests\n• Withdraw Consent: Where processing is based on consent, you may withdraw it at any time' },
  { num: '08', title: 'Data Security', content: 'We implement industry-standard security measures to protect your data, including encryption in transit (TLS) and at rest, access controls, and regular security audits. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.' },
  { num: '09', title: 'Children\'s Privacy (COPPA)', content: 'VYBE is not intended for users under 13 years of age. We do not knowingly collect personal information from children under 13. If we learn that we have collected data from a child under 13, we will promptly delete such information. Users between 13 and 15 have access restrictions enforced through our safety tier system.\n\nIn compliance with the Children\'s Online Privacy Protection Act (COPPA), users known to be under 13 are excluded from personalized advertising and remarketing. Any ad requests served on their accounts are tagged for child-directed treatment, and no interest-based ad targeting is performed.' },
  { num: '10', title: 'Changes to This Policy', content: 'We may update this Privacy Policy from time to time. We will notify you of material changes through the app or via email. We may require you to re-accept updated policies before continuing to use the Platform. The "Effective" date at the top of this page indicates when this version took effect.' },
  { num: '11', title: 'Personalized Advertising & Your Choices', content: 'When advertising is enabled, VYBE may display ads served by Google AdSense. These ads may be personalized based on your interests and prior activity. Personalized ads are clearly identified by the AdChoices icon.\n\nYour choices:\n\n• Opt out of personalized Google ads at https://adssettings.google.com\n• Opt out of third-party personalized ads industry-wide at https://www.aboutads.info/choices (US) or https://www.youronlinechoices.eu (EU)\n• Subscribe to VYBE+ (Premium) to remove all advertising from your experience\n• Decline tracking when prompted at sign-in to disable personalized ads\n\nWe do not use personalized advertising to target users based on sensitive categories such as health, race, religion, sexual orientation, or political affiliation, in accordance with Google\'s Personalized Advertising policy.' },
];

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background relative z-10" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-green-500/20 to-primary/20 blur-sm" />
              <div className="relative w-12 h-12 rounded-xl bg-card/80 backdrop-blur-sm border border-border/30 flex items-center justify-center">
                <Shield className="w-6 h-6 text-green-500" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Privacy Policy</h1>
              <p className="text-xs text-muted-foreground">Effective: {EFFECTIVE_DATE} · Version {PRIVACY_VERSION}</p>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-green-500/30 via-green-500/10 to-transparent mb-8" />

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
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-green-500/15 to-green-500/5 flex items-center justify-center text-xs font-bold text-green-500">
                    {s.num}
                  </span>
                  <h2 className="text-base font-semibold text-foreground pt-1">{s.title}</h2>
                </div>
                <div className="ml-11">
                  {s.content.split('\n\n').map((p, j) => (
                    <p key={j} className="text-sm text-muted-foreground mb-2 leading-relaxed whitespace-pre-line">{p}</p>
                  ))}
                </div>
              </motion.section>
            ))}

            {/* Contact */}
            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
              <div className="flex items-start gap-3 mb-2">
                <span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-green-500/15 to-green-500/5 flex items-center justify-center text-xs font-bold text-green-500">11</span>
                <h2 className="text-base font-semibold text-foreground pt-1">Contact Us</h2>
              </div>
              <div className="ml-11">
                <p className="text-sm text-muted-foreground mb-3">If you have questions about this Privacy Policy, contact us:</p>
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
            <p>See also: <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
