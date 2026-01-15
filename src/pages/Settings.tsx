import { useState, forwardRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LogOut, ChevronRight, Sparkles, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { APP_VERSION } from '@/lib/constants';
import { SettingsNav, SettingsNavVertical, SettingsCategory } from '@/components/settings/SettingsNav';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { ConnectionsSection } from '@/components/settings/ConnectionsSection';
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
    const titles: Record<SettingsCategory, string> = {
      profile: 'Profile Settings',
      privacy: 'Privacy & Security',
      connections: 'Connected Accounts',
      appearance: 'Appearance',
      themes: 'Custom Themes',
      feedback: 'Feedback & Sounds',
      notifications: 'Notification Preferences',
      language: 'Language & Region',
      help: 'Help & Support',
      developer: 'Developer Options',
    };
    return titles[activeCategory];
  };

  const renderContent = () => {
    switch (activeCategory) {
      case 'profile':
        return <ProfileSection />;
      case 'privacy':
        return <PrivacySection />;
      case 'connections':
        return <ConnectionsSection />;
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">{t('settings.title')}</h1>
              <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
            </div>
          </div>
        </motion.div>

        {/* Mobile: Horizontal scrolling nav */}
        {isMobile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6 -mx-4 px-4"
          >
            <SettingsNav 
              activeCategory={activeCategory} 
              onCategoryChange={setActiveCategory} 
            />
          </motion.div>
        )}

        {/* Desktop: Two-column layout */}
        <div className="flex gap-8">
          {/* Desktop sidebar nav */}
          {!isMobile && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="w-64 flex-shrink-0"
            >
              <div className="sticky top-4 space-y-4">
                <div className="liquid-glass-card p-2 overflow-hidden">
                  <SettingsNavVertical 
                    activeCategory={activeCategory} 
                    onCategoryChange={setActiveCategory} 
                  />
                </div>

                <Separator className="my-4" />

                {/* Sign Out Button - Desktop */}
                <Button
                  variant="outline"
                  className="w-full justify-between text-sm border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={handleSignOut}
                >
                  <span className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    {t('auth.logout')}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Button>

                {/* App Info - Desktop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-center pt-4 text-muted-foreground"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="gradient-static rounded-lg p-1.5">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-display font-black text-lg gradient-text">VYBE</span>
                  </div>
                  <p className="text-xs">v{APP_VERSION}</p>
                </motion.div>
              </div>
            </motion.div>
          )}

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
                <h2 className="text-lg font-semibold">{getCategoryTitle()}</h2>
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

            {/* Mobile: Sign Out & App Info */}
            {isMobile && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-8 space-y-6"
              >
                <Separator />
                
                <Button
                  variant="outline"
                  className="w-full justify-between text-sm border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
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
                  className="text-center py-6 text-muted-foreground"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="gradient-static rounded-lg p-1.5">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-display font-black text-xl gradient-text">VYBE</span>
                  </div>
                  <p className="text-sm">v{APP_VERSION}</p>
                </motion.div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
});

export default SettingsPage;
