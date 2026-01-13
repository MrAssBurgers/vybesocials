import { Home, Film, PlusCircle, MessageCircle, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useCallback, useRef, memo } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { CreateMenu } from '@/components/hub/CreateMenu';
import { VYBEHub } from '@/components/hub/VYBEHub';
import { useBreakpoint } from '@/hooks/usePlatform';

// Memoized nav item for better performance
const NavItem = memo(({
  path,
  icon: Icon,
  badge,
  isActive,
  label,
  showLabel,
}: {
  path: string;
  icon: typeof Home;
  badge: number;
  isActive: boolean;
  label: string;
  showLabel: boolean;
}) => (
  <Link
    to={path}
    className={cn(
      'relative flex items-center justify-center min-h-[44px] min-w-[44px]',
      showLabel && 'flex-col gap-1 py-1'
    )}
    onClick={triggerNavFeedback}
  >
    <div className={cn('relative', showLabel ? 'p-1.5' : 'p-2')}>
      {isActive && (
        <motion.div
          layoutId="bottomNavPill"
          className="absolute inset-0 rounded-xl bg-primary/15"
          transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
        />
      )}

      <Icon
        className={cn(
          'h-5 w-5 relative z-10',
          isActive ? 'text-primary' : 'text-muted-foreground'
        )}
      />

      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-md z-20">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>

    {showLabel && (
      <span
        className={cn(
          'text-[10px] font-medium leading-none',
          isActive ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
    )}
  </Link>
));

export function BottomNav() {
  const location = useLocation();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { isTablet } = useBreakpoint();

  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const lastTapTime = useRef(0);
  const lastScrollY = useRef(0);

  // Hide on scroll down, show on scroll up (mobile only)
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (latest) => {
    if (isTablet) return; // tablet/iPad nav must ALWAYS remain visible

    const diff = latest - lastScrollY.current;
    if (diff > 15 && latest > 60) {
      setIsVisible(false);
    } else if (diff < -8) {
      setIsVisible(true);
    }
    lastScrollY.current = latest;
  });

  const handleCreateClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;

    triggerHaptic('medium');
    playSound('pop');

    if (timeSinceLastTap < 300) {
      setIsCreateMenuOpen(false);
      setIsHubOpen(true);
    } else {
      setIsCreateMenuOpen(true);
    }

    lastTapTime.current = now;
  }, []);

  // Updated nav order: Home | Clips | Upload | Messages | Settings
  const navItems = [
    { icon: Home, path: '/home', badge: 0, label: 'Home' },
    { icon: Film, path: '/clips', badge: 0, label: 'Clips' },
    { icon: PlusCircle, path: '/upload', isCreate: true, badge: 0, label: 'Upload' },
    { icon: MessageCircle, path: '/messages', badge: unreadMessages, label: 'Messages' },
    { icon: Settings, path: '/settings', badge: 0, label: 'Settings' },
  ];

  const showLabel = isTablet;

  return (
    <>
      <CreateMenu isOpen={isCreateMenuOpen} onClose={() => setIsCreateMenuOpen(false)} />
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />

      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 pb-safe transition-transform duration-200 ease-out',
          isVisible ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Compact glass bar */}
        <div
          className={cn(
            'mb-2 rounded-2xl liquid-glass border border-foreground/15 shadow-lg shadow-black/30',
            showLabel ? 'mx-6' : 'mx-2'
          )}
        >
          <div className={cn('grid grid-cols-5 px-1 relative z-10', showLabel ? 'h-16' : 'h-14')}>
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path || location.pathname.startsWith(item.path + '/');

              if (item.isCreate) {
                return (
                  <div key={item.path} className="relative flex items-center justify-center">
                    <button
                      className={cn(
                        'relative flex items-center justify-center min-h-[44px] min-w-[44px]',
                        showLabel && 'flex-col gap-1 py-1'
                      )}
                      onClick={handleCreateClick}
                    >
                      <div className={cn('gradient-animated rounded-xl shadow-lg shadow-primary/30 active:scale-90 transition-transform', showLabel ? 'p-3' : 'p-2.5')}>
                        <PlusCircle className="h-5 w-5 text-primary-foreground" />
                      </div>
                      {showLabel && <span className="text-[10px] font-medium leading-none text-muted-foreground">{item.label}</span>}
                    </button>
                  </div>
                );
              }

              return (
                <NavItem
                  key={item.path}
                  path={item.path}
                  icon={item.icon}
                  badge={item.badge}
                  isActive={isActive}
                  label={item.label}
                  showLabel={showLabel}
                />
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
