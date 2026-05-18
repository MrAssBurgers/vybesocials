import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useUserRoleById } from '@/hooks/useUserRoleById';

const DEV_USERNAMES = ['bakrix', 'mrassburgers'];

/**
 * Hook to manage debug panel access control.
 * Opens via Cmd+Shift+D (desktop) or 7 taps on logo (mobile).
 * Only accessible to admin users or whitelisted dev usernames.
 */
export function useAdminDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, profile } = useAuth();
  const { data: role } = useUserRoleById(user?.id);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isDevUser = !!profile?.username && DEV_USERNAMES.includes(profile.username.toLowerCase());
  const isAdmin = role === 'admin' || role === 'owner' || isDevUser;

  // Keyboard shortcut: Cmd/Ctrl + Shift + D
  useEffect(() => {
    if (!isAdmin) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAdmin]);

  // 7-tap trigger for mobile
  const handleLogoTap = useCallback(() => {
    if (!isAdmin) return;

    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      setIsOpen(prev => !prev);
    } else {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 2000);
    }
  }, [isAdmin]);

  return {
    isOpen,
    setIsOpen,
    isAdmin,
    handleLogoTap,
  };
}
