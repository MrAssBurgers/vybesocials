import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Heart, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import {
  getPendingReferral,
  wasReferralConfirmed,
  markReferralConfirmed,
  cleanupReferralStorage,
  type PendingReferral,
} from '@/lib/referral';

type ConfirmStep = 'idle' | 'confirming' | 'rewarding' | 'notifying' | 'complete' | 'error';

interface StepInfo {
  progress: number;
  label: string;
}

const STEP_INFO: Record<ConfirmStep, StepInfo> = {
  idle: { progress: 0, label: '' },
  confirming: { progress: 25, label: 'Confirming invite…' },
  rewarding: { progress: 50, label: 'Granting reward…' },
  notifying: { progress: 75, label: 'Notifying friend…' },
  complete: { progress: 100, label: 'Complete!' },
  error: { progress: 0, label: 'Something went wrong' },
};

/**
 * Post-Tutorial/Onboarding Referral Confirmation Modal
 * 
 * TRIGGER CONDITIONS (ALL must be true):
 * - User is authenticated (user.id exists)
 * - User has a profile (profile.id exists)
 * - Onboarding is complete (profile.onboarding_completed = true)
 * - Tutorial is complete OR skipped (check DB directly for reliability)
 * - Pending referral exists in localStorage
 * - Referral not yet confirmed
 * 
 * FLOW:
 * 1. Listen for 'tutorial-completed' event OR poll profile status
 * 2. When conditions met, show modal
 * 3. On "Thank You" click: show event-driven progress bar
 * 4. Backend processes: redemption → reward → notification
 * 5. Cleanup and close
 */
export function InvitePopup() {
  const { user, profile } = useAuth();
  const [referral, setReferral] = useState<PendingReferral | null>(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<ConfirmStep>('idle');
  const processedRef = useRef(false);
  const rewardGrantedRef = useRef(false);

  // Check for pending referral when conditions are met
  const checkAndShowReferral = useCallback(async () => {
    // Already processed or visible
    if (processedRef.current || visible) return;
    
    // Require auth
    if (!user?.id || !profile?.id) {
      console.log('[InvitePopup] Waiting for auth');
      return;
    }
    
    // Already confirmed?
    if (wasReferralConfirmed()) {
      console.log('[InvitePopup] Referral already confirmed');
      cleanupReferralStorage();
      return;
    }
    
    // Check for pending referral
    const pending = getPendingReferral();
    if (!pending) {
      console.log('[InvitePopup] No pending referral');
      return;
    }
    
    // Prevent self-referral
    if (pending.inviterId === profile.id) {
      console.log('[InvitePopup] Self-referral detected, clearing');
      cleanupReferralStorage();
      return;
    }
    
    // Check if onboarding AND tutorial are complete (query DB directly for reliability)
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('onboarding_completed, tutorial_completed, tutorial_skipped')
        .eq('id', profile.id)
        .single();
      
      if (error) {
        console.error('[InvitePopup] Error checking profile:', error);
        return;
      }
      
      const onboardingDone = profileData?.onboarding_completed ?? false;
      const tutorialDone = (profileData?.tutorial_completed ?? false) || (profileData?.tutorial_skipped ?? false);
      
      console.log('[InvitePopup] Status check:', { onboardingDone, tutorialDone });
      
      // MUST have completed both onboarding AND tutorial
      if (!onboardingDone || !tutorialDone) {
        console.log('[InvitePopup] Waiting for onboarding/tutorial completion');
        return;
      }
    } catch (e) {
      console.error('[InvitePopup] Error:', e);
      return;
    }
    
    console.log('[InvitePopup] All conditions met, showing modal for:', pending.inviterUsername);
    
    // Verify inviter still exists
    const { data: inviterProfile, error: inviterError } = await supabase
      .from('profiles')
      .select('id, user_id, username, avatar_url, display_name')
      .eq('id', pending.inviterId)
      .maybeSingle();
    
    if (inviterError || !inviterProfile) {
      console.log('[InvitePopup] Inviter no longer exists');
      cleanupReferralStorage();
      return;
    }
    
    // Update with fresh data
    const freshReferral: PendingReferral = {
      inviterId: inviterProfile.id,
      inviterUserId: inviterProfile.user_id,
      inviterUsername: inviterProfile.username,
      inviterDisplayName: inviterProfile.display_name,
      inviterAvatarUrl: inviterProfile.avatar_url,
      timestamp: pending.timestamp,
    };
    
    setReferral(freshReferral);
    setVisible(true);
    processedRef.current = true;
    
    console.log('[InvitePopup] Showing confirmation modal');
  }, [user?.id, profile?.id, visible]);

  // Listen for tutorial-completed event
  useEffect(() => {
    const handleTutorialComplete = () => {
      console.log('[InvitePopup] Tutorial completed event received');
      // Delay slightly to let state settle
      setTimeout(() => checkAndShowReferral(), 500);
    };
    
    window.addEventListener('tutorial-completed', handleTutorialComplete);
    return () => window.removeEventListener('tutorial-completed', handleTutorialComplete);
  }, [checkAndShowReferral]);

  // Also check on mount and when auth changes (for users who already completed tutorial)
  useEffect(() => {
    if (!user?.id || !profile?.id) return;
    
    // Delay initial check to let app settle
    const timer = setTimeout(() => checkAndShowReferral(), 1500);
    return () => clearTimeout(timer);
  }, [user?.id, profile?.id, checkAndShowReferral]);

  /**
   * Call backend function to grant reward with step-by-step progress
   */
  const confirmReferralWithProgress = useCallback(async (
    inviterUserId: string, 
    inviterProfileId: string
  ): Promise<{ success: boolean; steps?: { redemptionCreated: boolean; rewardGranted: boolean; notificationSent: boolean } }> => {
    if (rewardGrantedRef.current) {
      console.log('[InvitePopup] Reward already granted');
      return { success: true, steps: { redemptionCreated: true, rewardGranted: true, notificationSent: true } };
    }
    
    try {
      console.log('[InvitePopup] Calling confirm-referral backend...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('[InvitePopup] No session');
        return { success: false };
      }
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-referral`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            inviterUserId,
            inviterProfileId,
          }),
        }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        console.error('[InvitePopup] Backend error:', result.error);
        return { success: false, steps: result.steps };
      }
      
      console.log('[InvitePopup] Backend success:', result);
      rewardGrantedRef.current = true;
      return { success: true, steps: result.steps };
    } catch (error) {
      console.error('[InvitePopup] Error calling backend:', error);
      return { success: false };
    }
  }, []);

  const handleThankYou = async () => {
    if (!profile?.id || !referral || step !== 'idle') return;

    // Step 1: User clicked - start confirming
    setStep('confirming');

    try {
      // Call backend and get step-by-step results
      const result = await confirmReferralWithProgress(
        referral.inviterUserId,
        referral.inviterId
      );

      // Animate through steps based on actual backend response
      if (!result.success) {
        setStep('error');
        toast.error("Couldn't confirm the invite. Please try again.");
        return;
      }

      const steps = result.steps;
      
      // Step 2: Redemption created → rewarding
      if (steps?.redemptionCreated) {
        setStep('rewarding');
        await new Promise(r => setTimeout(r, 400)); // Brief pause for smooth animation
      }

      // Step 3: Reward granted → notifying
      if (steps?.rewardGranted) {
        setStep('notifying');
        await new Promise(r => setTimeout(r, 400));
      }

      // Step 4: Notification sent → complete
      if (steps?.notificationSent) {
        setStep('complete');
      }

      // Mark as confirmed
      markReferralConfirmed();

      // Show success toast
      toast.success(`You and @${referral.inviterUsername} are now friends!`);

      // Close after showing complete state
      setTimeout(() => {
        setVisible(false);
        cleanupReferralStorage();
      }, 1500);
    } catch (error) {
      console.error('[InvitePopup] Error:', error);
      setStep('error');
      toast.error("Couldn't confirm the invite. Please try again.");
    }
  };

  const handleRetry = () => {
    setStep('idle');
  };

  if (!visible || !referral) return null;

  const currentStepInfo = STEP_INFO[step];
  const isProcessing = step !== 'idle' && step !== 'error';
  const isComplete = step === 'complete';
  const isError = step === 'error';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop - not dismissible by clicking */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-sm liquid-glass-card rounded-2xl p-8 shadow-xl"
        >
          <div className="text-center space-y-6">
            {isComplete ? (
              // Success animation
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="space-y-4"
              >
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: 'spring' }}
                    >
                      <Check className="h-10 w-10 text-green-500" />
                    </motion.div>
                  </div>
                </div>
                <p className="text-lg font-medium">Welcome to VYBE!</p>
              </motion.div>
            ) : (
              <>
                {/* Inviter Avatar with glow */}
                <div className="flex justify-center">
                  <div className="relative">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 rounded-full bg-primary/30 blur-xl"
                    />
                    <Avatar className="h-24 w-24 ring-4 ring-primary/20 relative z-10">
                      <AvatarImage src={referral.inviterAvatarUrl || undefined} />
                      <AvatarFallback className="text-3xl gradient-animated text-white">
                        {referral.inviterUsername?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                
                {/* Title */}
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">
                    @{referral.inviterUsername} invited you
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    Thanks for joining VYBE!
                  </p>
                </div>

                {/* Progress bar (only show when processing) */}
                {isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3 pt-2"
                  >
                    {/* Progress bar container */}
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: `${currentStepInfo.progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                    
                    {/* Step label */}
                    <motion.p
                      key={step}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-muted-foreground"
                    >
                      {currentStepInfo.label}
                    </motion.p>
                  </motion.div>
                )}

                {/* Error state */}
                {isError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3 pt-2"
                  >
                    <p className="text-sm text-destructive">
                      {currentStepInfo.label}
                    </p>
                    <Button
                      variant="outline"
                      onClick={handleRetry}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </Button>
                  </motion.div>
                )}
                
                {/* Action Button (only show when idle) */}
                {step === 'idle' && (
                  <div className="pt-2">
                    <Button
                      className="w-full gradient-animated text-lg py-6"
                      size="lg"
                      onClick={handleThankYou}
                    >
                      <Heart className="h-5 w-5 mr-2" />
                      Thank You
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
