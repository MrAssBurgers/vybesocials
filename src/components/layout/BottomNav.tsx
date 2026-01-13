import { Home, Film, PlusCircle, MessageCircle, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useCallback, useRef, memo } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { CreateMenu } from '@/components/hub/CreateMenu';
import { VYBEHub } from '@/components/hub/VYBEHub';

// Memoized nav item for better performance
const NavItem = memo(({ 
  path, 
  icon: Icon, 
  badge, 
  isActive 
}: { 
  path: string; 
  icon: typeof Home; 
  badge: number; 
  isActive: boolean;
}) => (
  <Link
    to={path}
    className="relative flex items-center justify-center min-h-[44px] min-w-[44px]"
    onClick={triggerNavFeedback}
  >
    <div className="relative p-2">
      {isActive && (
        <motion.div
          layoutId="bottomNavPill"
          className="absolute inset-0 rounded-xl bg-primary/15"
          transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
        />
      )}
      
      <Icon
        className={cn(
          "h-5 w-5 relative z-10",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
      />
      
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-md z-20">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
  </Link>
));

export function BottomNav() {
  const location = useLocation();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);
  
  const lastTapTime = useRef(0);

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

  // Updated nav order: Home | Clips | Upload | Messages | Community
  const navItems = [
    { icon: Home, path: '/home', badge: 0 },
    { icon: Film, path: '/clips', badge: 0 },
    { icon: PlusCircle, path: '/upload', isCreate: true, badge: 0 },
    { icon: MessageCircle, path: '/messages', badge: unreadMessages },
    { icon: Settings, path: '/settings', badge: 0 },
  ];

  return (
    <>
      <CreateMenu isOpen={isCreateMenuOpen} onClose={() => setIsCreateMenuOpen(false)} />
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />

      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 pb-safe lg:hidden"
      >
        {/* Compact glass bar */}
        <div className="mx-2 mb-2 rounded-2xl liquid-glass border border-foreground/15 shadow-lg shadow-black/30">
          <div className="grid grid-cols-5 h-14 px-1 relative z-10">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

              if (item.isCreate) {
                return (
                  <div key={item.path} className="relative flex items-center justify-center">
                    <button
                      className="relative flex items-center justify-center min-h-[44px] min-w-[44px]"
                      onClick={handleCreateClick}
                    >
                      <div className="gradient-animated rounded-xl p-2.5 shadow-lg shadow-primary/30 active:scale-90 transition-transform">
                        <PlusCircle className="h-5 w-5 text-primary-foreground" />
                      </div>
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
                />
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
