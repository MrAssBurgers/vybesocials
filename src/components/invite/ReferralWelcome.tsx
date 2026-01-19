import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { resetIntro } from '@/components/intro/IntroFlow';
import type { PendingReferral } from '@/lib/referral';

interface ReferralWelcomeProps {
  referral: PendingReferral;
  onContinue: () => void;
  onSignIn: () => void;
}

/**
 * Premium Referral Welcome Screen
 * 
 * Shows a polished, intentional welcome before signup:
 * - V logo
 * - "You've been invited to VYBE"
 * - "@username wants to connect with you"
 * - Continue button (goes to intro → signup)
 * - Sign In link (for existing users)
 */
export function ReferralWelcome({ referral, onContinue, onSignIn }: ReferralWelcomeProps) {
  const { reduceMotion } = useAccessibility();
  const [isReady, setIsReady] = useState(false);
  
  // Wait for splash screen to be fully gone
  useEffect(() => {
    const checkSplashGone = () => {
      const splashVisible = document.body.classList.contains('splash-visible');
      if (!splashVisible) {
        setIsReady(true);
        return;
      }
      setTimeout(checkSplashGone, 50);
    };
    
    // Give a small delay for everything to settle
    setTimeout(checkSplashGone, 300);
  }, []);
  
  const handleContinue = () => {
    // Reset intro so they get the full experience
    resetIntro();
    onContinue();
  };
  
  const handleSignIn = () => {
    onSignIn();
  };
  
  // Show nothing until ready (splash screen complete)
  if (!isReady) {
    return <div className="fixed inset-0 z-[200] bg-background" />;
  }
  
  const inviterName = referral.inviterDisplayName || referral.inviterUsername;
  
  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={reduceMotion ? {} : { rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-full h-full opacity-20"
        >
          <div className="w-full h-full gradient-animated rounded-full blur-3xl" />
        </motion.div>
        <motion.div
          animate={reduceMotion ? {} : { rotate: -360 }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/2 -right-1/2 w-full h-full opacity-15"
        >
          <div className="w-full h-full gradient-animated rounded-full blur-3xl" />
        </motion.div>
      </div>
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md text-center space-y-8"
        >
          {/* VYBE Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="flex justify-center"
          >
            <VYBELogo size="splash" showText={false} />
          </motion.div>
          
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2"
          >
            <h1 className="text-3xl sm:text-4xl font-display font-bold">
              You've been invited to VYBE
            </h1>
          </motion.div>
          
          {/* Inviter card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/30 backdrop-blur-sm border border-border/50">
              <Avatar className="h-14 w-14 ring-2 ring-primary/30">
                <AvatarImage src={referral.inviterAvatarUrl || undefined} />
                <AvatarFallback className="text-xl gradient-animated text-white">
                  {referral.inviterUsername?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="font-medium text-foreground">
                  @{referral.inviterUsername}
                </p>
                <p className="text-sm text-muted-foreground">
                  wants to connect with you
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
      
      {/* Bottom navigation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="relative z-10 p-6 pb-8 space-y-3"
      >
        <Button
          className="w-full gradient-animated text-white text-lg py-6"
          size="lg"
          onClick={handleContinue}
        >
          <Sparkles className="w-5 h-5 mr-2" />
          Continue
        </Button>
        
        <Button
          variant="outline"
          className="w-full text-lg py-6"
          size="lg"
          onClick={handleSignIn}
        >
          <LogIn className="w-5 h-5 mr-2" />
          Sign In
        </Button>
        
        <p className="text-center text-xs text-muted-foreground pt-2">
          Already have an account? Sign in to connect.
        </p>
      </motion.div>
    </div>
  );
}
