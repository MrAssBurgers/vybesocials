import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

interface GuestAuthPromptProps {
  /** Action being attempted (e.g., "add friends", "like posts", "comment") */
  action?: string;
  /** Compact inline version vs full modal */
  variant?: 'inline' | 'modal' | 'button';
  /** Custom message override */
  message?: string;
  /** For modal variant - whether it's open */
  open?: boolean;
  /** For modal variant - close callback */
  onClose?: () => void;
  /** Custom class */
  className?: string;
}

/**
 * Hook to check if user is a guest (not signed in)
 */
export function useIsGuest() {
  const { user, loading } = useAuth();
  return { isGuest: !loading && !user, loading };
}

/**
 * Prompt for guest users to sign up when attempting protected actions
 */
export const GuestAuthPrompt = React.forwardRef<HTMLDivElement, GuestAuthPromptProps>(function GuestAuthPrompt({ 
  action = 'do this',
  variant = 'inline',
  message,
  open = true,
  onClose,
  className = ''
}, _ref) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Don't show if user is authenticated
  if (user) return null;

  const displayMessage = message || `Sign up to ${action}`;

  const handleSignUp = () => {
    navigate('/signup');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  if (variant === 'button') {
    return (
      <Button 
        onClick={handleSignUp}
        className={`gradient-animated text-white ${className}`}
      >
        <UserPlus className="w-4 h-4 mr-2" />
        Sign up to {action}
      </Button>
    );
  }

  if (variant === 'modal') {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card rounded-2xl p-6 max-w-sm w-full relative"
              onClick={e => e.stopPropagation()}
            >
              {onClose && (
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <VybeMiniIcon size={32} showSparkles />
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold">Join VYBE</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    {displayMessage}
                  </p>
                </div>
                
                <div className="space-y-2 pt-2">
                  <Button 
                    onClick={handleSignUp}
                    className="w-full gradient-animated text-white"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Account
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleLogin}
                    className="w-full"
                  >
                    Log In
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Inline variant (default)
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border ${className}`}>
      <div className="flex-1 text-sm text-muted-foreground">
        {displayMessage}
      </div>
      <Button 
        size="sm" 
        onClick={handleSignUp}
        className="gradient-animated text-white shrink-0"
      >
        <UserPlus className="w-3 h-3 mr-1" />
        Sign Up
      </Button>
    </div>
  );
});
GuestAuthPrompt.displayName = 'GuestAuthPrompt';

/**
 * Wrapper component that shows auth prompt for guests
 */
export function RequireAuth({ 
  children, 
  action,
  fallback
}: { 
  children: React.ReactNode;
  action?: string;
  fallback?: React.ReactNode;
}) {
  const { isGuest } = useIsGuest();
  
  if (isGuest) {
    return fallback || <GuestAuthPrompt action={action} variant="inline" />;
  }
  
  return <>{children}</>;
}
