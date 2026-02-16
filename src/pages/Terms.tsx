import { motion } from 'framer-motion';
import { FileText, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';

const CONTACT_EMAIL = 'legal@vybeapp.com';
const EFFECTIVE_DATE = 'February 16, 2026';
const TOS_VERSION = '2.0';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
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
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Terms of Service</h1>
              <p className="text-muted-foreground">Effective: {EFFECTIVE_DATE} · Version {TOS_VERSION}</p>
            </div>
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By creating an account or using VYBE ("the Platform"), you agree to be bound by these Terms of Service ("Terms"). 
                If you do not agree, do not use the Platform. You must be at least 13 years of age to use VYBE. 
                By creating an account, you represent and warrant that you meet this age requirement. 
                Users under 16 may have restricted access to certain features as determined by VYBE's safety tier system.
              </p>
              <p className="text-muted-foreground mt-2">
                We may update these Terms from time to time. When we make material changes, we will notify you through the app 
                or via email. Your continued use of VYBE after such changes constitutes your acceptance of the updated Terms. 
                We may require you to re-accept updated Terms before continuing to use the Platform.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">2. User Accounts & Responsibilities</h2>
              <p className="text-muted-foreground">
                You are responsible for maintaining the confidentiality and security of your account credentials and for all 
                activities that occur under your account. You must provide accurate, current, and complete information during 
                registration and keep your account information updated. You may not share your account with others, create 
                multiple accounts, or transfer your account to another person.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">3. Prohibited Content & Conduct</h2>
              <p className="text-muted-foreground mb-2">You agree not to post, share, or transmit content that:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Is illegal, harmful, threatening, abusive, harassing, defamatory, or obscene</li>
                <li>Contains sexually explicit material involving minors</li>
                <li>Promotes hate speech, violence, or discrimination based on protected characteristics</li>
                <li>Contains graphic violence or gore</li>
                <li>Promotes scams, fraud, phishing, or other deceptive practices</li>
                <li>Infringes on the intellectual property rights of others</li>
                <li>Contains malware, viruses, or other harmful code</li>
              </ul>
              <p className="text-muted-foreground mt-2">You also agree not to:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Impersonate other users or entities</li>
                <li>Spam, harass, or send unsolicited messages</li>
                <li>Attempt to access unauthorized areas of the Platform</li>
                <li>Scrape, crawl, or harvest data from the Platform</li>
                <li>Use VYBE for any illegal purpose</li>
                <li>Circumvent or disable Platform safety features</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">4. Content Moderation & AI Analysis</h2>
              <p className="text-muted-foreground">
                VYBE uses AI-assisted tools to analyze content for community guideline compliance. These AI systems are 
                probabilistic in nature and may not always produce accurate results. AI analysis does not constitute a legal 
                or factual determination. You remain solely responsible for the content you post, regardless of AI scan results. 
                VYBE is not liable for any errors, false positives, or false negatives produced by automated content analysis.
              </p>
              <p className="text-muted-foreground mt-2">
                We reserve the right to review, remove, or restrict any content at our sole discretion. Content decisions 
                are logged and may be appealed through the Platform's appeal process. Moderation is community-driven and 
                AI-assisted — not guaranteed to catch every violation.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">5. Intellectual Property</h2>
              <p className="text-muted-foreground">
                You retain all ownership rights to the content you create and post on VYBE. By posting content, you grant 
                VYBE a worldwide, non-exclusive, royalty-free license to use, display, reproduce, and distribute your content 
                within the Platform and for promotional purposes. This license ends when you delete your content or account, 
                except for copies that have been shared by others or cached in backups.
              </p>
              <p className="text-muted-foreground mt-2">
                VYBE's name, logo, design, code, and branding are protected by intellectual property laws and may not be 
                used without our written permission.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">6. DMCA & Copyright Takedown</h2>
              <p className="text-muted-foreground">
                VYBE respects the intellectual property rights of others and complies with the Digital Millennium Copyright 
                Act (DMCA). If you believe your copyrighted work has been infringed, you may submit a DMCA takedown notice 
                to <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a> including: 
                (a) identification of the copyrighted work, (b) identification of the infringing material and its location on VYBE, 
                (c) your contact information, (d) a statement of good faith belief, and (e) a statement under penalty of perjury 
                that you are authorized to act on behalf of the copyright owner.
              </p>
              <p className="text-muted-foreground mt-2">
                <strong>Repeat Infringer Policy:</strong> VYBE will terminate the accounts of users who are found to be repeat 
                infringers of copyrighted material. We track and act upon valid DMCA notices.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">7. Creator Monetization</h2>
              <p className="text-muted-foreground">
                VYBE offers monetization features for eligible creators through the Creator Partner Program. Revenue splits 
                are as follows: Ad Revenue (Creator 60%, VYBE 40%), Subscriptions (Creator 80%, VYBE 20%), and Tips 
                (Creator 85%, VYBE 15%). These splits are subject to change with notice.
              </p>
              <p className="text-muted-foreground mt-2">
                <strong>No Earnings Guarantee:</strong> VYBE does not guarantee any level of income, earnings, or revenue 
                from the Platform. Earnings depend on many factors outside of VYBE's control, including audience engagement 
                and advertiser demand. Payouts are processed through Stripe Connect and subject to applicable tax laws. 
                Creators are responsible for their own tax reporting obligations.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">8. Account Suspension & Termination</h2>
              <p className="text-muted-foreground">
                We may suspend or terminate your account at any time, with or without notice, if you violate these Terms or 
                for any other reason at our sole discretion. You may delete your account at any time through Settings. Upon 
                termination, your right to use VYBE ceases immediately. We may retain certain data as required by law or for 
                legitimate business purposes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">9. Disclaimer of Warranties</h2>
              <p className="text-muted-foreground">
                VYBE is provided "as is" and "as available" without warranties of any kind, whether express or implied. 
                We do not guarantee that the Platform will be uninterrupted, error-free, secure, or continuously available. 
                We do not guarantee the accuracy of AI-assisted content analysis. We make no guarantees regarding Platform 
                uptime, data preservation, or feature availability.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">10. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                To the maximum extent permitted by applicable law, VYBE and its officers, directors, employees, and agents 
                shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from 
                your use of the Platform, including but not limited to loss of data, revenue, profits, or business opportunities.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">11. Dispute Resolution</h2>
              <p className="text-muted-foreground">
                Any disputes arising from these Terms or your use of VYBE shall be resolved through binding arbitration 
                administered in accordance with applicable arbitration rules, rather than in court. You agree to waive your 
                right to a jury trial and to participate in class action lawsuits. Small claims court actions are exempt from 
                this arbitration requirement. These Terms shall be governed by the laws of the applicable jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">12. Contact</h2>
              <p className="text-muted-foreground">
                For questions about these Terms, please contact us at:
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
            <p>See also: <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
