import { motion } from 'framer-motion';
import { Shield, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';

const CONTACT_EMAIL = 'vybesocial.info@gmail.com';
const EFFECTIVE_DATE = 'February 16, 2026';
const PRIVACY_VERSION = '2.0';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background relative z-10" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
              <p className="text-muted-foreground">Effective: {EFFECTIVE_DATE} · Version {PRIVACY_VERSION}</p>
            </div>
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">1. Information We Collect</h2>
              <p className="text-muted-foreground mb-2">We collect the following categories of information:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li><strong>Account Information:</strong> Username, email address, date of birth, profile photo, bio, and display name</li>
                <li><strong>Content:</strong> Posts, messages, comments, media you upload, and interactions with other users</li>
                <li><strong>Usage Data:</strong> Feature usage patterns, app interactions, session duration, and navigation paths</li>
                <li><strong>Device Information:</strong> Device type, operating system, browser type, IP address, and device identifiers</li>
                <li><strong>Payment Information:</strong> Processed securely through Stripe; we do not store full payment card details</li>
                <li><strong>AI Processing Data:</strong> Content submitted for AI safety analysis (images, video, text) — processed in real-time and not stored after analysis</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">2. How We Use Your Information</h2>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Provide and improve VYBE's features and services</li>
                <li>Personalize your experience (feed, recommendations, safety settings)</li>
                <li>Enforce community guidelines through AI-assisted and human moderation</li>
                <li>Process payments and creator monetization</li>
                <li>Send notifications and service communications</li>
                <li>Detect and prevent fraud, abuse, and security threats</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">3. AI Processing Disclosure</h2>
              <p className="text-muted-foreground">
                VYBE uses AI-powered systems to analyze uploaded media and text for community guideline compliance. 
                This processing is probabilistic and automated. AI analysis results do not constitute legal or factual 
                determinations. Content submitted for AI analysis is processed in real-time and is not retained after 
                the analysis is complete. You may appeal automated decisions through the Platform's appeal process.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">4. Data Sharing & Third Parties</h2>
              <p className="text-muted-foreground mb-2">
                We do not sell your personal information to third parties. We may share data with:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li><strong>Service Providers:</strong> Stripe (payments), cloud hosting, analytics tools, and AI processing services</li>
                <li><strong>Legal Obligations:</strong> When required by law, regulation, or legal process</li>
                <li><strong>Safety:</strong> To protect the rights, safety, or property of VYBE, our users, or the public</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Your public profile and posts are visible to other VYBE users. Private account content is visible 
                only to approved followers.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">5. Data Retention</h2>
              <p className="text-muted-foreground">
                We retain your account data for as long as your account is active. Posts are retained for 25 days 
                unless deleted sooner. Messages are retained for the duration of the conversation. If you delete 
                your account, we will remove your personal data within 30 days, except where retention is required 
                by law or for legitimate business purposes (e.g., fraud prevention, legal claims).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">6. Cookies & Tracking</h2>
              <p className="text-muted-foreground">
                We use cookies and similar technologies to maintain your session, remember your preferences, and 
                understand how you use VYBE. Essential cookies are required for the Platform to function. Analytics 
                cookies help us improve the Platform. You can manage cookie preferences in your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">7. Your Rights (GDPR & Global)</h2>
              <p className="text-muted-foreground mb-2">
                Depending on your location, you may have the following rights regarding your personal data:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Request correction of inaccurate data</li>
                <li><strong>Deletion:</strong> Request deletion of your account and data via Settings</li>
                <li><strong>Data Portability:</strong> Request an export of your data in a machine-readable format</li>
                <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
                <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
                <li><strong>Withdraw Consent:</strong> Where processing is based on consent, you may withdraw it at any time</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                To exercise any of these rights, contact us at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a> or 
                use the account management features in Settings.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">8. Data Security</h2>
              <p className="text-muted-foreground">
                We implement industry-standard security measures to protect your data, including encryption in transit 
                (TLS) and at rest, access controls, and regular security audits. However, no method of transmission or 
                storage is completely secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">9. Children's Privacy</h2>
              <p className="text-muted-foreground">
                VYBE is not intended for users under 13 years of age. We do not knowingly collect personal information 
                from children under 13. If we learn that we have collected data from a child under 13, we will promptly 
                delete such information. Users between 13 and 15 have access restrictions enforced through our safety tier system.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">10. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time. We will notify you of material changes through the 
                app or via email. We may require you to re-accept updated policies before continuing to use the Platform. 
                The "Effective" date at the top of this page indicates when this version took effect.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">11. Contact Us</h2>
              <p className="text-muted-foreground">
                If you have questions about this Privacy Policy, your data, or wish to exercise your privacy rights, contact us at:
              </p>
              <a 
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-2 text-primary hover:underline mt-2"
              >
                <Mail className="w-4 h-4" />
                {CONTACT_EMAIL}
              </a>
            </section>
          </div>

          <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
            <p>See also: <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
