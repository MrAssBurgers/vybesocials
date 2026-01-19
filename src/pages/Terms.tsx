import { motion } from 'framer-motion';
import { FileText, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';

const CONTACT_EMAIL = 'support@vybeapp.com';

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
              <p className="text-muted-foreground">Last updated: January 2026</p>
            </div>
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By accessing or using VYBE, you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, please do not use the app.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">2. User Accounts</h2>
              <p className="text-muted-foreground">
                You are responsible for maintaining the security of your account and all 
                activities that occur under your account. You must provide accurate information 
                when creating your account.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">3. Content Guidelines</h2>
              <p className="text-muted-foreground">
                You agree not to post content that is illegal, harmful, threatening, abusive, 
                harassing, defamatory, or otherwise objectionable. We reserve the right to 
                remove content that violates these guidelines.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">4. Prohibited Activities</h2>
              <p className="text-muted-foreground">
                You may not: impersonate others, spam, harass users, distribute malware, 
                attempt to access unauthorized areas, scrape data, or use VYBE for any 
                illegal purposes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">5. Intellectual Property</h2>
              <p className="text-muted-foreground">
                You retain ownership of content you create. By posting content, you grant VYBE 
                a license to display and distribute it within the app. VYBE's design, code, 
                and branding are protected by intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">6. Account Termination</h2>
              <p className="text-muted-foreground">
                We may suspend or terminate your account if you violate these terms. You may 
                delete your account at any time through Settings. Upon termination, your 
                right to use VYBE ceases immediately.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">7. Disclaimer of Warranties</h2>
              <p className="text-muted-foreground">
                VYBE is provided "as is" without warranties of any kind. We do not guarantee 
                that the app will be error-free, secure, or continuously available.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">8. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                To the maximum extent permitted by law, VYBE shall not be liable for any 
                indirect, incidental, or consequential damages arising from your use of the app.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">9. Changes to Terms</h2>
              <p className="text-muted-foreground">
                We may modify these terms at any time. Continued use of VYBE after changes 
                constitutes acceptance of the modified terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-foreground">10. Contact</h2>
              <p className="text-muted-foreground">
                For questions about these terms, please contact us at:
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