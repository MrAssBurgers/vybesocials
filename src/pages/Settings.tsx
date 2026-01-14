import { useState, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LogOut, ChevronRight, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
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
      default:
        return <ProfileSection />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-4">{t('settings.title')}</h1>

        {/* Mobile: Horizontal scrolling nav */}
        {isMobile ? (
          <div className="mb-4">
            <SettingsNav 
              activeCategory={activeCategory} 
              onCategoryChange={setActiveCategory} 
            />
          </div>
        ) : null}

        {/* Desktop: Two-column layout */}
        <div className="flex gap-6">
          {/* Desktop sidebar nav */}
          {!isMobile && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-56 flex-shrink-0 sticky top-4 self-start"
            >
              <div className="liquid-glass-card p-3">
                <SettingsNavVertical 
                  activeCategory={activeCategory} 
                  onCategoryChange={setActiveCategory} 
                />
              </div>

              {/* Sign Out Button - Desktop */}
              <div className="mt-4">
                <Button
                  variant="destructive"
                  className="w-full justify-between text-sm"
                  onClick={handleSignOut}
                >
                  <span className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    {t('auth.logout')}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* App Info - Desktop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-center mt-6 text-muted-foreground"
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="gradient-static rounded-lg p-1">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-display font-black text-lg gradient-text">VYBE</span>
                </div>
                <p className="text-xs">Version 2.0.0</p>
              </motion.div>
            </motion.div>
          )}

          {/* Main content area */}
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-w-0"
          >
            {renderContent()}

            {/* Mobile: Sign Out & App Info */}
            {isMobile && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-6"
                >
                  <Button
                    variant="destructive"
                    className="w-full justify-between text-sm"
                    onClick={handleSignOut}
                  >
                    <span className="flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      {t('auth.logout')}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-center mt-8 text-muted-foreground pb-4"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="gradient-static rounded-lg p-1">
                      <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <span className="font-display font-black text-lg sm:text-xl gradient-text">VYBE</span>
                  </div>
                  <p className="text-xs sm:text-sm">Version 2.0.0</p>
                  <p className="text-[10px] sm:text-xs mt-1">{t('app.tagline')}</p>
                </motion.div>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
});

export default SettingsPage;
