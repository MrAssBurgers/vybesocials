import { motion } from 'framer-motion';
import { Cookie, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';

const CONTACT_EMAIL = 'vybesocial.info@gmail.com';
const EFFECTIVE_DATE = 'February 16, 2026';

export default function CookiePolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Cookie className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Cookie Policy</h1>
              <p className="text-xs text-muted-foreground">Effective: {EFFECTIVE_DATE}</p>
            </div>
          </div>

          <div className="prose prose-sm prose-invert max-w-none space-y-6 text-muted-foreground">
            <section>
              <h2 className="text-lg font-semibold text-foreground">1. What Are Cookies</h2>
              <p>Cookies are small text files stored on your device when you visit a website. They help the site remember your preferences and understand how you use it. VYBE uses cookies and similar technologies to provide, protect, and improve our platform.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">2. Types of Cookies We Use</h2>

              <h3 className="text-base font-medium text-foreground mt-4">Essential Cookies</h3>
              <p>These are strictly necessary for VYBE to function. They handle authentication, security, and basic functionality. You cannot opt out of these cookies.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Authentication tokens</strong> — Keep you signed in securely</li>
                <li><strong>Session cookies</strong> — Maintain your session state</li>
                <li><strong>CSRF protection</strong> — Prevent cross-site request forgery</li>
                <li><strong>Cookie consent</strong> — Remember your cookie preferences</li>
              </ul>

              <h3 className="text-base font-medium text-foreground mt-4">Functional Cookies</h3>
              <p>These remember your preferences and choices to provide a personalized experience.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Theme preferences</strong> — Your chosen color theme and display settings</li>
                <li><strong>Language settings</strong> — Your preferred language</li>
                <li><strong>Content preferences</strong> — Feed sorting and display mode</li>
                <li><strong>Notification settings</strong> — Sound and vibration preferences</li>
              </ul>

              <h3 className="text-base font-medium text-foreground mt-4">Analytics Cookies</h3>
              <p>These help us understand how users interact with VYBE so we can improve the platform.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Usage patterns</strong> — Pages visited, features used, time spent</li>
                <li><strong>Performance metrics</strong> — Load times and error rates</li>
                <li><strong>Device information</strong> — Screen size, browser type (anonymized)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">3. Local Storage & Similar Technologies</h2>
              <p>In addition to cookies, VYBE uses browser local storage and session storage for:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Caching profile data for faster loading</li>
                <li>Storing draft posts and unsent messages</li>
                <li>Remembering your feed position</li>
                <li>PWA offline functionality</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">4. Third-Party Cookies</h2>
              <p>VYBE may use limited third-party services that set their own cookies:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Stripe</strong> — Payment processing (when making purchases)</li>
                <li><strong>Google OAuth</strong> — Sign-in with Google (only during authentication)</li>
              </ul>
              <p>We do not use third-party advertising or tracking cookies.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">5. Managing Your Cookies</h2>
              <p>You can manage your cookie preferences in several ways:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Cookie banner</strong> — Accept or decline non-essential cookies when first visiting VYBE</li>
                <li><strong>Browser settings</strong> — Most browsers allow you to block or delete cookies</li>
                <li><strong>Device settings</strong> — Mobile devices offer cookie controls in system settings</li>
              </ul>
              <p className="text-sm">Note: Blocking essential cookies may prevent VYBE from functioning properly.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">6. Data Retention</h2>
              <p>Session cookies are deleted when you close your browser. Persistent cookies and local storage data are retained for up to 12 months, or until you clear your browser data or delete your account.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">7. Updates to This Policy</h2>
              <p>We may update this Cookie Policy from time to time. Significant changes will be communicated through the platform.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">8. Contact Us</h2>
              <p>If you have questions about our use of cookies, contact us at:</p>
              <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                <Mail className="w-4 h-4" /> {CONTACT_EMAIL}
              </a>
            </section>

            <section className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                See also: <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> · <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
