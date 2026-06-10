import { useState, lazy, Suspense } from 'react';
import { MessageSquareHeart, BookOpen, MessageCircle, Shield, FileText, Play, Download, Star } from 'lucide-react';
import { openRateApp } from '@/lib/rateApp';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { InstallAppSheet } from './InstallAppSheet';
import {
  SettingsSectionCard,
  SettingsActionRow,
} from './SettingsUI';

const MobileIntro = lazy(() => import('@/pages/MobileIntro'));

export function HelpSection() {
  const [showInstallSheet, setShowInstallSheet] = useState(false);
  const [showIntroReplay, setShowIntroReplay] = useState(false);

  return (
    <div className="space-y-6">
      {showIntroReplay && (
        <Suspense fallback={null}>
          <MobileIntro onDone={() => setShowIntroReplay(false)} />
        </Suspense>
      )}

      <SettingsSectionCard
        icon={MessageSquareHeart}
        title="Help & Support"
        description="Get help with VYBE or share your feedback"
      >
        <div className="space-y-2">
          <SettingsActionRow
            variant="accent"
            icon={<VybeMiniIcon size={20} showSparkles className="text-white" />}
            iconClassName="bg-gradient-to-br from-primary to-accent shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]"
            title="Interactive Tutorial"
            description="Learn how to use VYBE"
            onClick={() => {
              haptics.tap();
              window.dispatchEvent(new CustomEvent('open-tutorial'));
            }}
          />

          <SettingsActionRow
            icon={<Play className="w-5 h-5 text-secondary-foreground" />}
            iconClassName="bg-secondary"
            title="Replay walkthrough"
            description="Watch the VYBE intro again"
            onClick={() => {
              haptics.tap();
              try {
                localStorage.removeItem('vybe_intro_seen');
              } catch {
                /* ignore */
              }
              setShowIntroReplay(true);
            }}
          />

          <SettingsActionRow
            to="/feedback"
            icon={<MessageCircle className="w-5 h-5 text-secondary-foreground" />}
            iconClassName="bg-secondary"
            title="Feedback Hub"
            description="Share ideas & report issues"
          />

          <SettingsActionRow
            variant="accent"
            icon={<Download className="w-5 h-5 text-white" />}
            iconClassName="bg-gradient-to-br from-primary to-accent"
            title="Install Web App"
            description="Add VYBE to your home screen"
            onClick={() => {
              haptics.tap();
              setShowInstallSheet(true);
            }}
          />

          <SettingsActionRow
            variant="gold"
            icon={<Star className="w-5 h-5 text-white fill-white" />}
            iconClassName="bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30"
            title="Rate VYBE"
            description="Love the app? Leave us a review"
            onClick={() => {
              haptics.tap();
              openRateApp();
              toast.success('Thanks for supporting VYBE! ⭐');
            }}
          />

          <SettingsActionRow
            variant="primary"
            to="/apply-moderator"
            icon={<Shield className="w-5 h-5 text-primary" />}
            iconClassName="bg-primary/15"
            title="Apply for Moderator"
            description="Help keep VYBE safe"
          />
        </div>
      </SettingsSectionCard>

      <InstallAppSheet open={showInstallSheet} onOpenChange={setShowInstallSheet} />

      <SettingsSectionCard icon={FileText} title="Legal" delay={0.1}>
        <div className="space-y-2">
          <SettingsActionRow
            to="/privacy"
            icon={<Shield className="w-5 h-5 text-muted-foreground" />}
            iconClassName="bg-foreground/[0.04] border border-foreground/[0.06]"
            title="Privacy Policy"
          />
          <SettingsActionRow
            to="/terms"
            icon={<FileText className="w-5 h-5 text-muted-foreground" />}
            iconClassName="bg-foreground/[0.04] border border-foreground/[0.06]"
            title="Terms of Service"
          />
          <SettingsActionRow
            to="/child-safety"
            icon={<Shield className="w-5 h-5 text-rose-500" />}
            iconClassName="bg-rose-500/10 border border-rose-500/20"
            title="Child Safety Standards"
          />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard icon={BookOpen} title="Quick Help" delay={0.2}>
        <div className="space-y-2">
          <div className="settings-faq-item">
            <p className="font-medium text-sm mb-1">How do I change my profile picture?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Go to your profile and tap on your avatar to upload a new photo.
            </p>
          </div>
          <div className="settings-faq-item">
            <p className="font-medium text-sm mb-1">How do I make my account private?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Head to Settings → Privacy and toggle the Private Account switch.
            </p>
          </div>
          <div className="settings-faq-item">
            <p className="font-medium text-sm mb-1">How do I customize my theme?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Go to Settings → Themes to create or browse custom themes.
            </p>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Need more help?"
        description="We're here for you! Use the Feedback Hub to reach out and we'll get back to you as soon as possible."
        delay={0.3}
        className="bg-gradient-to-br from-primary/[0.06] to-accent/[0.04] border-primary/15"
      />
    </div>
  );
}
