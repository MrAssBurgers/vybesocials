import { useState, forwardRef, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { SecuritySection } from '@/components/settings/SecuritySection';
import { ConnectionsSection } from '@/components/settings/ConnectionsSection';
import { SubscriptionSection } from '@/components/settings/SubscriptionSection';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { ThemesSection } from '@/components/settings/ThemesSection';
import { FeedbackSection } from '@/components/settings/FeedbackSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { LanguageSection } from '@/components/settings/LanguageSection';
import { HelpSection } from '@/components/settings/HelpSection';
import { ParentalControlsSection } from '@/components/settings/ParentalControlsSection';
import { ScreenTimeSection } from '@/components/settings/ScreenTimeSection';
import { useIsMobile } from '@/hooks/use-mobile';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountDangerZone } from '@/components/settings/AccountDangerZone';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

// Lazy load developer section (only used in dev)
const DeveloperSection = lazy(() => import('@/components/settings/DeveloperSection').then(m => ({ default: m.DeveloperSection })));

const SettingsPage = forwardRef<HTMLDivElement, {}>(function SettingsPage(_, ref) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const initialTab = searchParams.get('tab') as SettingsCategory | null;
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialTab || 'profile');
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return; // debounce: ignore repeat clicks while in-flight
    setIsSigningOut(true);
    haptics.impact();
    try {
      await signOut();
      navigate('/');
    } finally {
      setSignOutOpen(false);
      // Leave isSigningOut=true if we navigated away; reset if we stayed on page
      setIsSigningOut(false);
    }
  };

  const getCategoryTitle = () => {
    const titleKeys: Record<SettingsCategory, string> = {
      profile: 'settingsNav.profileSettings',
      privacy: 'settingsNav.privacyAndSecurity',
      security: 'Security & 2FA',
      connections: 'settingsNav.connectedAccounts',
      subscription: 'settingsNav.subscription',
      appearance: 'settingsNav.appearance',
      themes: 'settingsNav.customThemes',
      feedback: 'settingsNav.feedbackAndSounds',
      notifications: 'settingsNav.notificationPreferences',
      language: 'settingsNav.languageAndRegion',
      help: 'settingsNav.helpAndSupport',
      developer: 'settingsNav.developerOptions',
      parental: 'Parental Controls',
      screentime: 'Screen Time',
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
      case 'parental':
        return <ParentalControlsSection />;
      case 'screentime':
        return <ScreenTimeSection />;
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
        {/* Header — Premium glass identity */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2.5 sm:gap-3 mb-2">
            <div className="relative w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center flex-shrink-0">
              {/* Rotating gradient ring */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/30 via-accent/20 to-primary/30 animate-spin" style={{ animationDuration: '8s' }} />
              <div className="absolute inset-[2px] rounded-[10px] bg-background" />
              <Settings className="relative w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold truncate gradient-text">{t('settings.title')}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{t('settingsNav.manageAccount')}</p>
            </div>
          </div>
          <div className="h-[2px] rounded-full bg-gradient-to-r from-primary/40 via-accent/30 to-transparent" />
        </div>

        {/* Mobile: Dropdown category selector */}
        {isMobile && (
          <div className="mb-4">
            <SettingsNav 
              activeCategory={activeCategory} 
              onCategoryChange={setActiveCategory} 
            />
          </div>
        )}

        {/* Category selector for desktop (horizontal tabs style) */}
        {!isMobile && (
          <div className="mb-6">
            <div className="liquid-glass-card p-2 overflow-hidden">
              <div className="flex flex-wrap gap-2">
                <SettingsNavVertical 
                  activeCategory={activeCategory} 
                  onCategoryChange={setActiveCategory} 
                />
              </div>
            </div>
          </div>
        )}

        {/* Content layout */}
        <div className="flex gap-8">

          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {/* Section title for desktop */}
            {!isMobile && (
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{getCategoryTitle()}</h2>
              </div>
            )}

            <motion.div 
              key={activeCategory} 
              className="min-h-[400px]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {renderContent()}
            </motion.div>

            {/* Account Management — only inside Privacy & Security tab */}
            {activeCategory === 'privacy' && (
              <section
                aria-label="Account management and danger zone"
                className="mt-6 space-y-4"
              >
                <div className="h-[1px] bg-gradient-to-r from-transparent via-border/30 to-transparent" />
                <div aria-label="Danger zone" role="region">
                  <AccountDangerZone />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  aria-label={t('auth.logout')}
                  aria-busy={isSigningOut}
                  disabled={isSigningOut}
                  className="w-auto inline-flex gap-2 text-sm border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/15 hover:border-destructive/40 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={() => !isSigningOut && setSignOutOpen(true)}
                >
                  {isSigningOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t('auth.logout')}
                </Button>

                <AlertDialog open={signOutOpen} onOpenChange={(o) => !isSigningOut && setSignOutOpen(o)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Sign out of VYBE?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You'll need to sign back in to access your account, messages, and content.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isSigningOut}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          handleSignOut();
                        }}
                        disabled={isSigningOut}
                        aria-busy={isSigningOut}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
                      >
                        {isSigningOut ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Signing out...
                          </span>
                        ) : (
                          'Sign out'
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </section>
            )}

            {/* App Info */}
            <div className="mt-6 pb-4">
              <div className="text-center py-4 text-muted-foreground">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <VybeMiniIcon size={28} showSparkles />
                  <span className="font-display font-black text-xl gradient-text">VYBE</span>
                </div>
                <p className="text-xs">v{APP_VERSION}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
});

export default SettingsPage;
