import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <AppLayout>
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
              <h1 className="text-2xl font-bold">Privacy Policy</h1>
              <p className="text-muted-foreground">Last updated: January 2026</p>
            </div>
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold mb-3">1. Information We Collect</h2>
              <p className="text-muted-foreground">
                VYBE collects information you provide directly, including your profile information, 
                messages, posts, and interactions with other users. We also collect usage data to 
                improve our services.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">2. How We Use Your Information</h2>
              <p className="text-muted-foreground">
                We use your information to provide and improve VYBE's features, personalize your 
                experience, send notifications, and ensure the safety of our community.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">3. Information Sharing</h2>
              <p className="text-muted-foreground">
                Your public profile and posts are visible to other users. We do not sell your 
                personal information to third parties. We may share data with service providers 
                who help us operate VYBE.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">4. Data Security</h2>
              <p className="text-muted-foreground">
                We implement industry-standard security measures to protect your data. Messages 
                are encrypted in transit and at rest. We regularly review and update our security 
                practices.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">5. Your Rights</h2>
              <p className="text-muted-foreground">
                You can access, update, or delete your account information at any time through 
                Settings. You can also request a copy of your data or ask us to delete your 
                account entirely.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">6. Cookies & Tracking</h2>
              <p className="text-muted-foreground">
                We use cookies and similar technologies to maintain your session, remember your 
                preferences, and understand how you use VYBE. You can manage cookie preferences 
                in your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">7. Children's Privacy</h2>
              <p className="text-muted-foreground">
                VYBE is not intended for users under 13 years of age. We do not knowingly collect 
                personal information from children under 13.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">8. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this privacy policy from time to time. We will notify you of any 
                significant changes through the app or via email.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">9. Contact Us</h2>
              <p className="text-muted-foreground">
                If you have questions about this privacy policy or your data, please use the 
                Feedback Hub in Settings to reach out to us.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
