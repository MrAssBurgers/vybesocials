import { useState, forwardRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LogOut, ChevronRight, Settings } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { APP_VERSION } from '@/lib/constants';
import { SettingsNav, SettingsNavVertical, SettingsCategory } from '@/components/settings/SettingsNav';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { ConnectionsSection } from '@/components/settings/ConnectionsSection';
import { SubscriptionSection } from '@/components/settings/SubscriptionSection';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { ThemesSection } from '@/components/settings/ThemesSection';
import { FeedbackSection } from '@/components/settings/FeedbackSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { LanguageSection } from '@/components/settings/LanguageSection';
import { HelpSection } from '@/components/settings/HelpSection';
import { useIsMobile } from '@/hooks/use-mobile';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy load developer section (only used in dev)
const DeveloperSection = lazy(() => import('@/components/settings/DeveloperSection').then(m => ({ default: m.DeveloperSection })));

const SettingsPage = forwardRef<HTMLDivElement, {}>(function SettingsPage(_, ref) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('profile');

  const handleSignOut = async () => {
    haptics.impact();
    await signOut();
    navigate('/');
  };

  const getCategoryTitle = () => {
    const titleKeys: Record<SettingsCategory, string> = {
      profile: 'settingsNav.profileSettings',
      privacy: 'settingsNav.privacyAndSecurity',
      connections: 'settingsNav.connectedAccounts',
      subscription: 'settingsNav.subscription',
      appearance: 'settingsNav.appearance',
      themes: 'settingsNav.customThemes',
      feedback: 'settingsNav.feedbackAndSounds',
      notifications: 'settingsNav.notificationPreferences',
      language: 'settingsNav.languageAndRegion',
      help: 'settingsNav.helpAndSupport',
      developer: 'settingsNav.developerOptions',
    };
    return t(titleKeys[activeCategory]);
  };

  const renderContent = () => {
    switch (activeCategory) {
      case 'profile':
        return <ProfileSection />;
      case 'privacy':
        return <PrivacySection />;
      case 'connections':
        return <ConnectionsSection />;
      case 'subscription':
        return <SubscriptionSection />;
      case 'appearance':
        return <AppearanceSection />;
      case 'themes':
        return <ThemesSection />;
      case 'feedback':
        return <FeedbackSection />;
      case 'notifications':
        return <NotificationsSection />;
      case 'language':
        return <LanguageSection />;
      case 'help':
        return <HelpSection />;
      case 'developer':
        return (
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <DeveloperSection />
          </Suspense>
        );
      default:
        return <ProfileSection />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-8 pb-24 sm:pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-6"
        >
          <div className="flex items-center gap-2.5 sm:gap-3 mb-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold truncate text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{t('settings.title')}</h1>
              <p className="text-xs sm:text-sm text-foreground/80 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{t('settingsNav.manageAccount')}</p>
            </div>
          </div>
        </motion.div>

        {/* Mobile: Dropdown category selector */}
        {isMobile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4"
          >
            <SettingsNav 
              activeCategory={activeCategory} 
              onCategoryChange={setActiveCategory} 
            />
          </motion.div>
        )}

        {/* Category selector for desktop (horizontal tabs style) */}
        {!isMobile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className="liquid-glass-card p-2 overflow-hidden">
              <div className="flex flex-wrap gap-2">
                <SettingsNavVertical 
                  activeCategory={activeCategory} 
                  onCategoryChange={setActiveCategory} 
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Content layout */}
        <div className="flex gap-8">

          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {/* Section title for desktop */}
            {!isMobile && (
              <motion.div
                key={`title-${activeCategory}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-4"
              >
                <h2 className="text-lg font-semibold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{getCategoryTitle()}</h2>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={activeCategory}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="min-h-[400px]"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>

            {/* Sign Out & App Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 space-y-4 pb-4"
            >
              <Separator />


              <Button
                variant="outline"
                className="w-full justify-between text-sm border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground h-11"
                onClick={handleSignOut}
              >
                <span className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  {t('auth.logout')}
                </span>
                <ChevronRight className="h-4 w-4" />
              </Button>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-center py-4 text-muted-foreground"
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <VybeMiniIcon size={28} showSparkles />
                  <span className="font-display font-black text-xl gradient-text">VYBE</span>
                </div>
                <p className="text-xs">v{APP_VERSION}</p>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
});

export default SettingsPage;
