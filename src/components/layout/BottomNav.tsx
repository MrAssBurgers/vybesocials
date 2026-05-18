import { Home, Compass, Plus, MessageCircle, User, GripVertical, Check } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { preloadRoute } from '@/lib/routePreloader';
import { cn } from '@/lib/utils';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useCallback, useRef, memo, useEffect, forwardRef, useMemo } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { CreateMenuLayer } from '@/components/hub/CreateMenuLayer';
import { VYBEHub } from '@/components/hub/VYBEHub';
import { useIsGuest, GuestAuthPrompt } from '@/components/auth/GuestAuthPrompt';
import { useAuth } from '@/lib/auth';
import { navVisibility } from '@/lib/navVisibility';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { T, TAP, MOTION_CONFIG } from '@/lib/motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useUserPreferences, useUpdatePreferences } from '@/hooks/useUserPreferences';

// Singleton scroll direction detection to prevent duplicate listeners
let scrollDirectionCleanup: (() => void) | null = null;
let scrollVisibility = true;
const scrollVisibilityListeners = new Set<(visible: boolean) => void>();

function setupScrollDirectionListener() {
  if (scrollDirectionCleanup) return;
  
  let lastScrollY = 0;
  let ticking = false;

  const handleScroll = (e?: Event) => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-app-scroll-container="true"]');
      const currentScrollY = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
      const scrollDiff = currentScrollY - lastScrollY;
      
      if (Math.abs(scrollDiff) > 10) {
        scrollVisibility = !(scrollDiff > 0 && currentScrollY > 50);
      }
      
      if (currentScrollY < 50) {
        scrollVisibility = true;
      }
      
      lastScrollY = currentScrollY;
      ticking = false;
      
      scrollVisibilityListeners.forEach(fn => fn(scrollVisibility));
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  
  const observer = new MutationObserver(() => {
    const container = document.querySelector('[data-app-scroll-container="true"]');
    if (container && !(container as any).__scrollBound) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      (container as any).__scrollBound = true;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
  const container = document.querySelector('[data-app-scroll-container="true"]');
  if (container) {
    container.addEventListener('scroll', handleScroll, { passive: true });
    (container as any).__scrollBound = true;
  }

  scrollDirectionCleanup = () => {
    window.removeEventListener('scroll', handleScroll);
    observer.disconnect();
    const el = document.querySelector('[data-app-scroll-container="true"]');
    if (el) el.removeEventListener('scroll', handleScroll);
    scrollDirectionCleanup = null;
  };
}

function useScrollDirection() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setupScrollDirectionListener();
    
    scrollVisibilityListeners.add(setIsVisible);
    setIsVisible(scrollVisibility);

    return () => {
      scrollVisibilityListeners.delete(setIsVisible);
      if (scrollVisibilityListeners.size === 0 && scrollDirectionCleanup) {
        scrollDirectionCleanup();
      }
    };
  }, []);

  return isVisible;
}

function useNavVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    return navVisibility.subscribe(setIsVisible);
  }, []);

  return isVisible;
}

// Default nav order
const DEFAULT_NAV_ORDER = ['home', 'explore', 'create', 'messages', 'profile'];

// Nav item type
interface NavItemConfig {
  id: string;
  icon: typeof Home;
  label: string;
  getPath: (profile?: any) => string;
  badge?: number;
  tutorialId?: string;
  requiresAuth?: boolean;
  authAction?: string;
  isCreate?: boolean;
  isProfile?: boolean;
}

// Draggable nav item component
const DraggableNavItem = memo(({ 
  item,
  isActive,
  isEditMode,
  badge,
  profile,
  isHighlighted,
  onClick,
}: { 
  item: NavItemConfig;
  isActive: boolean;
  isEditMode: boolean;
  badge: number;
  profile: any;
  isHighlighted?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) => {
  const Icon = item.icon;
  const path = item.getPath(profile);

  const handleClick = (e: React.MouseEvent) => {
    if (isEditMode) {
      e.preventDefault();
      return;
    }
    if (onClick) {
      onClick(e);
    } else {
      triggerNavFeedback();
    }
  };

  const handlePrefetch = useCallback(() => {
    try { preloadRoute(path); } catch { /* noop */ }
  }, [path]);

  // Profile item with avatar
  if (item.isProfile) {
    return (
      <Reorder.Item
        value={item.id}
        dragListener={isEditMode}
        as="div"
        className="relative flex flex-1 items-center justify-center min-h-[48px]"
      >
        <Link
          to={path}
          className="relative flex items-center justify-center min-h-[48px] group w-full"
          onClick={handleClick}
          onPointerEnter={handlePrefetch}
          onTouchStart={handlePrefetch}
          onFocus={handlePrefetch}
          data-tutorial={item.tutorialId}
        >
          <motion.div 
            className="relative"
            whileTap={isEditMode ? {} : TAP.whileTap}
            transition={T.press}
          >
            {isEditMode && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={MOTION_CONFIG.spring.bouncy}
                className="absolute -top-2 -left-2 z-20"
              >
                <GripVertical className="h-3 w-3 text-primary" />
              </motion.div>
            )}
            {isActive && !isEditMode && (
              <motion.div
                layoutId="nav-indicator"
                className="absolute -inset-1.5 rounded-xl bg-primary/15"
                transition={T.indicator}
              />
            )}
            <Avatar className={cn(
              "h-7 w-7 relative z-10 transition-[box-shadow,transform]",
              isActive && "ring-2 ring-primary",
              isEditMode && "animate-pulse"
            )}>
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-[10px] bg-muted">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </motion.div>
        </Link>
      </Reorder.Item>
    );
  }

  return (
    <Reorder.Item
      value={item.id}
      dragListener={isEditMode}
      as="div"
      className="relative flex flex-1 items-center justify-center min-h-[48px]"
    >
      <Link
        to={path}
        className="relative flex items-center justify-center min-h-[48px] group w-full"
        onClick={handleClick}
        data-tutorial={item.tutorialId}
      >
        <motion.div 
          className="relative"
          whileTap={isEditMode ? {} : TAP.whileTap}
          transition={T.press}
        >
          {isEditMode && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={MOTION_CONFIG.spring.bouncy}
              className="absolute -top-2 -left-2 z-20"
            >
              <GripVertical className="h-3 w-3 text-primary" />
            </motion.div>
          )}
          {isActive && !isEditMode && (
            <motion.div
              layoutId="nav-indicator"
              className="absolute -inset-1.5 rounded-xl bg-primary/15"
              transition={T.indicator}
            />
          )}
          {isHighlighted && (
            <div className="absolute -inset-2 rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse" />
          )}
          <motion.div
            animate={{ scale: isActive && !isEditMode ? 1.15 : 1 }}
            transition={MOTION_CONFIG.spring.snappy}
          >
            <Icon
              className={cn(
                "h-6 w-6 relative z-10 transition-colors duration-150",
                isActive ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground",
                isEditMode && "animate-pulse"
              )}
            />
          </motion.div>
          {badge > 0 && !isEditMode && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={MOTION_CONFIG.spring.bouncy}
              className="absolute -top-1 -right-1.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-md z-20"
            >
              {badge > 9 ? '9+' : badge}
            </motion.span>
          )}
        </motion.div>
      </Link>
    </Reorder.Item>
  );
});

export const BottomNav = memo(forwardRef<HTMLElement, object>(function BottomNav(_props, ref) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { isGuest } = useIsGuest();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: prefs } = useUserPreferences();
  const { mutate: updatePrefs } = useUpdatePreferences();
  const scrollVisible = useScrollDirection();
  const navCentralVisible = useNavVisibility();
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Hide nav when an input/textarea/contenteditable is focused, or when soft keyboard opens
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const onFocusIn = (e: FocusEvent) => {
      if (isEditableTarget(e.target)) setInputFocused(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isEditableTarget(e.target)) setInputFocused(false);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const onVVResize = () => {
      if (!vv) return;
      setKeyboardOpen(vv.height < window.innerHeight - 100);
    };
    vv?.addEventListener('resize', onVVResize);
    onVVResize();

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onVVResize);
    };
  }, []);

  const isVisible = scrollVisible && navCentralVisible && !inputFocused && !keyboardOpen;
  const onboardingComplete = profile?.onboarding_completed === true;

  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [highlightedNav, setHighlightedNav] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authPromptAction, setAuthPromptAction] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  
  const lastTapTime = useRef(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);

  // Get nav order from preferences
  const navOrder = useMemo(() => {
    const savedOrder = (prefs?.extra as any)?.nav_order as string[] | undefined;
    return savedOrder && savedOrder.length === 5 ? savedOrder : DEFAULT_NAV_ORDER;
  }, [prefs?.extra]);

  // Nav items configuration
  const navItemsConfig: NavItemConfig[] = useMemo(() => [
    { id: 'home', icon: Home, label: 'Home', getPath: () => '/home', tutorialId: 'home-nav', requiresAuth: false },
    { id: 'explore', icon: Compass, label: 'Explore', getPath: () => '/explore', tutorialId: 'explore-nav', requiresAuth: false },
    { id: 'create', icon: Plus, label: 'Create', getPath: () => '/upload', isCreate: true, tutorialId: 'create-nav', requiresAuth: true },
    { id: 'messages', icon: MessageCircle, label: 'Messages', getPath: () => '/messages', tutorialId: 'messages-nav', requiresAuth: true, authAction: 'send messages' },
    { id: 'profile', icon: User, label: 'Profile', getPath: (p) => p ? `/u/${p.username}` : '/settings', tutorialId: 'profile-nav', requiresAuth: false, isProfile: true },
  ], []);

  // Ordered nav items based on saved preference
  const orderedNavItems = useMemo(() => {
    return navOrder.map(id => navItemsConfig.find(item => item.id === id)!).filter(Boolean);
  }, [navOrder, navItemsConfig]);

  // Report effective visibility to AppLayout (so it can collapse padding)
  useEffect(() => {
    navVisibility.setEffectiveVisible(isVisible);
  }, [isVisible]);

  // Tutorial event listeners
  useEffect(() => {
    const handleOpenCreateMenu = () => setIsCreateMenuOpen(true);
    const handleOpenVYBEHub = () => {
      setIsCreateMenuOpen(false);
      setIsHubOpen(true);
    };
    const handleCloseMenus = () => {
      setIsCreateMenuOpen(false);
      setIsHubOpen(false);
    };
    const handleHighlightNav = (e: CustomEvent<{ navId: string | null }>) => {
      setHighlightedNav(e.detail.navId);
    };

    window.addEventListener('tutorial-open-create-menu', handleOpenCreateMenu);
    window.addEventListener('tutorial-open-vybe-hub', handleOpenVYBEHub);
    window.addEventListener('tutorial-close-menus', handleCloseMenus);
    window.addEventListener('tutorial-highlight-nav', handleHighlightNav as EventListener);

    return () => {
      window.removeEventListener('tutorial-open-create-menu', handleOpenCreateMenu);
      window.removeEventListener('tutorial-open-vybe-hub', handleOpenVYBEHub);
      window.removeEventListener('tutorial-close-menus', handleCloseMenus);
      window.removeEventListener('tutorial-highlight-nav', handleHighlightNav as EventListener);
    };
  }, []);

  // Long press handlers for edit mode
  const handleCreateTouchStart = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      triggerHaptic('heavy');
      playSound('pop');
      setIsEditMode(true);
    }, 600);
  }, []);

  const handleCreateTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleCreateClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // If long press was triggered, don't do normal click
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }

    // If in edit mode, confirm and exit
    if (isEditMode) {
      triggerHaptic('medium');
      playSound('pop');
      setIsEditMode(false);
      return;
    }
    
    if (isGuest) {
      setAuthPromptAction('create posts');
      setShowAuthPrompt(true);
      return;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    triggerHaptic('medium');
    playSound('pop');
    
    if (timeSinceLastTap < 300) {
      setIsCreateMenuOpen(false);
      setIsHubOpen(true);
    } else if (isCreateMenuOpen) {
      setIsCreateMenuOpen(false);
    } else {
      setIsCreateMenuOpen(true);
    }
    
    lastTapTime.current = now;
  }, [isCreateMenuOpen, isGuest, isEditMode]);

  const handleProtectedNavClick = useCallback((action: string) => (e: React.MouseEvent) => {
    if (isGuest) {
      e.preventDefault();
      setAuthPromptAction(action);
      setShowAuthPrompt(true);
    } else {
      triggerNavFeedback();
    }
  }, [isGuest]);

  // Handle reorder
  const handleReorder = useCallback((newOrder: string[]) => {
    triggerHaptic('light');
    updatePrefs({
      extra: {
        ...(prefs?.extra || {}),
        nav_order: newOrder,
      },
    });
  }, [updatePrefs, prefs?.extra]);

  // Exit edit mode on outside tap
  useEffect(() => {
    if (!isEditMode) return;
    
    const handleOutsideClick = (e: TouchEvent | MouseEvent) => {
      const nav = document.querySelector('[data-tutorial-bottomnav]');
      if (nav && !nav.contains(e.target as Node)) {
        setIsEditMode(false);
      }
    };

    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('mousedown', handleOutsideClick);
    
    return () => {
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isEditMode]);

  if (!onboardingComplete && !isGuest) {
    return null;
  }

  return (
    <>
      <CreateMenuLayer open={isCreateMenuOpen} onOpenChange={setIsCreateMenuOpen} />
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />
      <GuestAuthPrompt 
        variant="modal"
        action={authPromptAction}
        open={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
      />

      {/* Edit mode aura overlay */}
      <AnimatePresence>
        {isEditMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-[5001]"
            style={{
              background: 'radial-gradient(circle at 50% 100%, hsl(var(--primary) / 0.3) 0%, hsl(var(--accent) / 0.15) 30%, transparent 70%)',
            }}
          >
            {/* Animated border pulse */}
            <motion.div
              className="absolute inset-0 border-4 border-primary/50 rounded-none"
              animate={{
                borderColor: ['hsl(var(--primary) / 0.5)', 'hsl(var(--accent) / 0.5)', 'hsl(var(--primary) / 0.5)'],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {/* Edit mode label */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg"
            >
              ✨ Drag to reorder • Tap + to save
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.nav 
        ref={ref}
        className="fixed inset-x-0 flex justify-center px-2 pointer-events-none"
        initial={false}
        animate={{
          y: isVisible ? 0 : 140,
          opacity: isVisible ? 1 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 24,
          mass: 0.9,
        }}
        style={{
          zIndex: 5002,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        }}
        aria-label="Bottom navigation"
        data-tutorial-bottomnav
      >
        <div 
          className={cn(
            "w-full max-w-[420px] sm:max-w-[480px] md:max-w-[560px] rounded-[28px] overflow-hidden transition-[background-color,border-color] duration-300 relative pointer-events-auto",
            isEditMode 
              ? "border border-primary/60 shadow-[0_0_30px_hsl(var(--primary)/0.5)]" 
              : "border border-white/5"
          )}
          style={{
            background: 'hsl(var(--card))',
            boxShadow: isEditMode 
              ? '0 8px 32px hsl(var(--primary) / 0.5), inset 0 1px 0 hsl(var(--primary) / 0.3)'
              : '0 10px 30px hsl(var(--background) / 0.55), 0 2px 10px hsl(0 0% 0% / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
          }}
        >
          {/* VYBE aurora wash — subtle multi-color tint behind the icons */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none gradient-animated"
            style={{ opacity: isEditMode ? 0.55 : 0.22 }}
          />
          {/* Top accent hairline — soft brand glow, fades into nav */}
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px pointer-events-none bg-gradient-to-r from-transparent via-primary/35 to-transparent"
            style={{
              maskImage: 'linear-gradient(to bottom, hsl(0 0% 0% / 1), transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, hsl(0 0% 0% / 1), transparent)',
            }}
          />
          <Reorder.Group
            axis="x"
            values={navOrder}
            onReorder={handleReorder}
            as="div"
            className="flex items-stretch h-14 px-1 relative z-10"
          >
            {orderedNavItems.map((item) => {
              const path = item.getPath(profile);
              const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
              const isHighlighted = highlightedNav === item.tutorialId;
              const badge = item.id === 'messages' ? unreadMessages : 0;

              if (item.isCreate) {
                return (
                  <Reorder.Item
                    key={item.id}
                    value={item.id}
                    dragListener={isEditMode}
                    as="div"
                    className="relative flex flex-1 items-center justify-center"
                    data-tutorial="create-nav"
                  >
                    <motion.button
                      className="relative flex items-center justify-center min-h-[44px] min-w-[44px] touch-manipulation"
                      onClick={handleCreateClick}
                      onTouchStart={handleCreateTouchStart}
                      onTouchEnd={handleCreateTouchEnd}
                      onTouchCancel={handleCreateTouchEnd}
                      onMouseDown={handleCreateTouchStart}
                      onMouseUp={handleCreateTouchEnd}
                      onMouseLeave={handleCreateTouchEnd}
                      whileTap={{ scale: 0.8 }}
                      whileHover={{ scale: 1.08 }}
                    >
                      {isEditMode && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1 -left-1 z-30"
                        >
                          <GripVertical className="h-3 w-3 text-white" />
                        </motion.div>
                      )}
                      <motion.div
                        className="absolute rounded-full pointer-events-none"
                        style={{
                          inset: -6,
                          background: 'radial-gradient(circle, hsl(var(--primary) / 0.55), hsl(var(--accent) / 0.35), transparent 70%)',
                          opacity: 0.5,
                          filter: 'blur(14px)',
                          transform: 'translateZ(0)',
                          willChange: 'transform',
                          WebkitBackfaceVisibility: 'hidden',
                          backfaceVisibility: 'hidden',
                        }}
                      />
                      <AnimatePresence>
                        {isCreateMenuOpen && !isEditMode && (
                          <motion.div
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1.2, opacity: 0.65 }}
                            exit={{ scale: 0.85, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 rounded-2xl pointer-events-none"
                            style={{
                              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.6), hsl(var(--accent) / 0.6))',
                              filter: 'blur(12px)',
                              transform: 'translateZ(0)',
                              willChange: 'transform, opacity',
                              WebkitBackfaceVisibility: 'hidden',
                              backfaceVisibility: 'hidden',
                            }}
                          />
                        )}
                      </AnimatePresence>
                      {isHighlighted && (
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="absolute -inset-1 rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"
                        />
                      )}
                      <motion.div 
                        animate={{ 
                          rotate: isEditMode ? 0 : (isCreateMenuOpen ? 45 : 0),
                          scale: isCreateMenuOpen ? 1.15 : 1,
                        }}
                        transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                        className={cn(
                          "rounded-2xl p-2.5 relative overflow-hidden",
                          isEditMode ? "bg-primary" : "create-button-gradient"
                        )}
                      >
                        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                          <div
                            className="absolute inset-0"
                            style={{
                              background: 'linear-gradient(90deg, transparent 0%, transparent 30%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.06) 55%, transparent 70%, transparent 100%)',
                              animation: 'shimmer-sweep 4s linear infinite',
                            }}
                          />
                        </div>
                        {isEditMode ? (
                          <Check className="h-6 w-6 text-white relative z-10" strokeWidth={2.5} />
                        ) : (
                          <Plus className="h-6 w-6 text-white relative z-10" strokeWidth={2.5} />
                        )}
                      </motion.div>
                    </motion.button>
                  </Reorder.Item>
                );
              }

              return (
                <DraggableNavItem
                  key={item.id}
                  item={item}
                  isActive={isActive}
                  isEditMode={isEditMode}
                  badge={badge}
                  profile={profile}
                  isHighlighted={isHighlighted}
                  onClick={item.requiresAuth ? handleProtectedNavClick(item.authAction || 'use this feature') : undefined}
                />
              );
            })}
          </Reorder.Group>
        </div>
      </motion.nav>
    </>
  );
}));
