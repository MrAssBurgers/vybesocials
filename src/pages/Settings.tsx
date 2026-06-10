import { useState, useEffect, forwardRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { haptics } from '@/lib/haptics';
import { APP_VERSION } from '@/lib/constants';
import {
  SettingsHomeList,
  SettingsSidebar,
  CategoryTile,
  getCategoryMeta,
  SettingsCategory,
} from '@/components/settings/SettingsNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { useBreakpoint } from '@/hooks/usePlatform';
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

// Lazy load developer section (only used in dev)
const DeveloperSection = lazy(() => import('@/components/settings/DeveloperSection').then(m => ({ default: m.DeveloperSection })));

const CATEGORY_TITLES: Record<SettingsCategory, string> = {
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

const SettingsPage = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(function SettingsPage(_, ref) {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Match AppLayout's breakpoint: sidebar layout only on true desktop (lg+),
  // otherwise the fixed mobile header overlays the scrollport and breaks sticky.
  const { isDesktop } = useBreakpoint();
  const isMobile = !isDesktop;
  const initialTab = searchParams.get('tab') as SettingsCategory | null;
  // Mobile starts at the grouped home list; desktop always shows a section.
  const [activeCategory, setActiveCategory] = useState<SettingsCategory | null>(initialTab);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const desktopCategory: SettingsCategory = activeCategory || 'profile';
  const mobileView: 'home' | 'detail' = activeCategory ? 'detail' : 'home';

  // Jump back to the top when navigating between settings views
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [activeCategory]);

  const handleSignOut = async () => {
    if (isSigningOut) return; // debounce: ignore repeat clicks while in-flight
    setIsSigningOut(true);
    haptics.impact();
    try {
      await signOut();
      navigate('/');
    } finally {
      setSignOutOpen(false);
      setIsSigningOut(false);
    }
  };

  const renderContent = (category: SettingsCategory) => {
    switch (category) {
      case 'profile':
        return <ProfileSection />;
      case 'privacy':
        return <PrivacySection />;
      case 'security':
        return <SecuritySection />;
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

  /* Danger zone + sign out — shown inside Privacy & Security */
  const renderPrivacyExtras = () => (
    <section aria-label="Account management and danger zone" className="mt-6 space-y-4">
      <div className="h-[1px] bg-gradient-to-r from-transparent via-border/30 to-transparent" />
      <div aria-label="Danger zone" role="region">
        <AccountDangerZone />
      </div>
    </section>
  );

  const renderFooter = () => (
    <div className="mt-8 pb-4">
      <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent mb-5" />
      <div className="text-center text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <VybeMiniIcon size={28} showSparkles />
          <span className="font-display font-black text-xl gradient-text tracking-tight">VYBE</span>
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">Version {APP_VERSION}</p>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="settings-shell max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-8 pb-24 sm:pb-8 relative">
        {/* Ambient aurora behind the header */}
        <div aria-hidden className="absolute top-0 inset-x-0 h-48 pointer-events-none overflow-hidden -z-10">
          <div className="absolute -top-20 left-[10%] w-64 h-64 rounded-full blur-[90px] opacity-25" style={{ background: 'hsl(var(--primary))' }} />
          <div className="absolute -top-24 right-[15%] w-72 h-72 rounded-full blur-[100px] opacity-20" style={{ background: 'hsl(var(--accent))' }} />
        </div>

        {/* ============ MOBILE ============ */}
        {isMobile ? (
          <AnimatePresence mode="popLayout" initial={false}>
            {mobileView === 'home' ? (
              <motion.div
                key="home"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                {/* Big clean title */}
                <div className="mb-5 px-1">
                  <h1 className="text-[28px] font-bold gradient-text tracking-tight leading-tight">{t('settings.title')}</h1>
                  <p className="text-sm text-muted-foreground">{t('settingsNav.manageAccount')}</p>
                </div>

                {/* Profile hero — jumps straight to profile settings */}
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => {
                    haptics.tap();
                    setActiveCategory('profile');
                  }}
                  className="w-full liquid-glass-card flex items-center gap-3.5 px-4 py-3.5 mb-5 text-left group"
                >
                  <div className="rounded-full p-[2px] bg-gradient-to-br from-primary via-accent to-primary shrink-0">
                    <Avatar className="h-12 w-12 ring-2 ring-background">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                        {profile?.username?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px] truncate">
                      {profile?.display_name || `@${profile?.username || 'you'}`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{profile?.username} · Edit profile
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                </motion.button>

                <SettingsHomeList onSelect={setActiveCategory} />

                {/* Log out */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.32, duration: 0.3 }}
                  className="mt-5"
                >
                  <button
                    onClick={() => {
                      haptics.tap();
                      setSignOutOpen(true);
                    }}
                    disabled={isSigningOut}
                    className="w-full liquid-glass-card flex items-center justify-center gap-2 px-4 py-3.5 text-destructive font-semibold text-[15px] active:bg-destructive/10 transition-colors disabled:opacity-60"
                  >
                    {isSigningOut ? (
                      <Loader2 className="w-[18px] h-[18px] animate-spin" />
                    ) : (
                      <LogOut className="w-[18px] h-[18px]" />
                    )}
                    {t('auth.logout')}
                  </button>
                </motion.div>

                {renderFooter()}
              </motion.div>
            ) : (
              <motion.div
                key={`detail-${activeCategory}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                {/* Back bar */}
                <div className="flex items-center gap-3 mb-5">
                  <button
                    onClick={() => {
                      haptics.tap();
                      setActiveCategory(null);
                    }}
                    aria-label="Back to settings"
                    className="w-9 h-9 rounded-full liquid-glass-card flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <ArrowLeft className="w-[18px] h-[18px]" />
                  </button>
                  {activeCategory && <CategoryTile category={activeCategory} size="sm" />}
                  <h2 className="text-lg font-bold tracking-tight truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                    {activeCategory ? t(CATEGORY_TITLES[activeCategory]) : ''}
                  </h2>
                </div>

                <div className="min-h-[400px]">
                  {activeCategory && renderContent(activeCategory)}
                </div>
                {activeCategory === 'privacy' && renderPrivacyExtras()}
                {renderFooter()}
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          /* ============ DESKTOP ============ */
          <>
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="mb-8"
            >
              <h1 className="text-3xl font-bold gradient-text tracking-tight">{t('settings.title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('settingsNav.manageAccount')}</p>
            </motion.div>

            <div className="flex gap-8 items-start">
              {/* Sidebar — stays pinned while the section content scrolls */}
              <aside
                className="w-60 flex-shrink-0 sticky self-start overflow-y-auto overscroll-contain pr-1"
                style={{
                  top: '0.75rem',
                  maxHeight: 'calc(100dvh - 2rem)',
                  scrollbarWidth: 'none',
                }}
              >
                <SettingsSidebar
                  activeCategory={desktopCategory}
                  onCategoryChange={setActiveCategory}
                />
                <div className="mt-5 pt-4 border-t border-border/40">
                  <button
                    onClick={() => {
                      haptics.tap();
                      setSignOutOpen(true);
                    }}
                    disabled={isSigningOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                  >
                    {isSigningOut ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    {t('auth.logout')}
                  </button>
                </div>
              </aside>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <motion.div
                  key={`title-${desktopCategory}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mb-4 flex items-center gap-2.5"
                >
                  <CategoryTile category={desktopCategory} size="sm" />
                  <h2 className="text-lg font-semibold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                    {t(CATEGORY_TITLES[desktopCategory])}
                  </h2>
                </motion.div>

                <motion.div
                  key={desktopCategory}
                  className="min-h-[400px]"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  {renderContent(desktopCategory)}
                </motion.div>

                {desktopCategory === 'privacy' && renderPrivacyExtras()}
                {renderFooter()}
              </div>
            </div>
          </>
        )}

        {/* Sign out confirmation — shared by mobile + desktop */}
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
      </div>
    </AppLayout>
  );
});

export default SettingsPage;
