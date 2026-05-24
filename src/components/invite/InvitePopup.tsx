import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Heart, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
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

function generateCorrelationId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Post-Tutorial/Onboarding Referral Confirmation Modal
 */
export function InvitePopup() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [referral, setReferral] = useState<PendingReferral | null>(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<ConfirmStep>('idle');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const processedRef = useRef(false);
  const rewardGrantedRef = useRef(false);
  const lastProfileIdRef = useRef<string | null>(null);

  // Check for pending referral when conditions are met
  const checkAndShowReferral = useCallback(async () => {
    if (processedRef.current || visible) return;
    
    const currentPath = location.pathname;
    const windowPath = window.location.pathname;
    const isOnHome = currentPath === '/home' || windowPath === '/home';
    const isOnInviteFlow = currentPath.startsWith('/invite/') || windowPath.startsWith('/invite/');
    
    if (!isOnHome && !isOnInviteFlow) return;
    
    // CRITICAL: Require FULL auth - user + profile + username
    if (!user?.id || !profile?.id || !profile?.username) return;

    if (lastProfileIdRef.current !== profile.id) {
      lastProfileIdRef.current = profile.id;
      processedRef.current = false;
    }
    
    if (wasReferralConfirmed()) {
      cleanupReferralStorage();
      return;
    }
    
    const pending = getPendingReferral();
    if (!pending) return;
    
    // Self-referral guard
    if (pending.inviterId === profile.id) {
      cleanupReferralStorage();
      return;
    }
    
    // Verify onboarding + tutorial completion from DB
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('referral_inviter_id, tutorial_completed, tutorial_skipped, onboarding_completed')
        .eq('id', profile.id)
        .single();
      
      if (error) return;
      
      if (profileData?.referral_inviter_id) {
        cleanupReferralStorage();
        return;
      }
      
      if (!profileData?.onboarding_completed) return;
      
      const tutorialDone = (profileData?.tutorial_completed ?? false) || (profileData?.tutorial_skipped ?? false);
      if (!tutorialDone) return;
    } catch {
      return;
    }
    
    // Verify inviter still exists
    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('id, user_id, username, avatar_url, display_name')
      .eq('id', pending.inviterId)
      .maybeSingle();
    
    if (!inviterProfile) {
      cleanupReferralStorage();
      return;
    }
    
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
  }, [user?.id, profile?.id, profile?.username, location.pathname, visible]);

  // Listen for tutorial-completed event
  useEffect(() => {
    const handleTutorialComplete = () => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.location.pathname === '/home' || attempts >= 20) {
          clearInterval(interval);
          checkAndShowReferral();
        }
      }, 500);
    };
    
    window.addEventListener('tutorial-completed', handleTutorialComplete);
    return () => window.removeEventListener('tutorial-completed', handleTutorialComplete);
  }, [checkAndShowReferral]);

  // Poll when on /home or invite route
  useEffect(() => {
    const isOnHome = location.pathname === '/home';
    const isOnInviteFlow = location.pathname.startsWith('/invite/');
    if (!isOnHome && !isOnInviteFlow) return;
    if (!user?.id || !profile?.id || !profile?.username) return;
    if (processedRef.current || visible) return;
    
    const pending = getPendingReferral();
    if (!pending) return;
    
    const timer = setTimeout(() => checkAndShowReferral(), 1500);
    return () => clearTimeout(timer);
  }, [location.pathname, user?.id, profile?.id, profile?.username, checkAndShowReferral, visible]);

  /**
   * Call backend to confirm referral — with correlationId + structured errors
   */
  const confirmReferral = useCallback(async (
    inviterUserId: string, 
    inviterProfileId: string
  ): Promise<{ success: boolean; error?: string; errorCode?: string; stepFailed?: string; steps?: { redemptionCreated: boolean; rewardGranted: boolean; notificationSent: boolean } }> => {
    if (rewardGrantedRef.current) {
      return { success: true, steps: { redemptionCreated: true, rewardGranted: true, notificationSent: true } };
    }
    
    const correlationId = generateCorrelationId();
    
    try {
      // Get a fresh token
      let activeToken: string | undefined;
      const { data: { session } } = await supabase.auth.getSession();
      activeToken = session?.access_token;
      
      if (!activeToken) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        activeToken = refreshData.session?.access_token;
      }
      
      if (!activeToken) {
        return { success: false, error: "You're not logged in. Please sign in and try again.", errorCode: "NO_SESSION" };
      }
      
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-referral`;
      
      console.log('[InvitePopup] confirm-referral request', {
        correlationId,
        userId: user?.id,
        profileId: profile?.id,
        inviterProfileId,
        inviterUserId,
        url: fnUrl,
      });
      
      let response: Response;
      try {
        response = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'x-correlation-id': correlationId,
          },
          body: JSON.stringify({ inviterUserId, inviterProfileId }),
        });
      } catch (networkErr) {
        const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
        console.error('[InvitePopup] Fetch failed (network):', msg);
        return { success: false, error: `Network error: ${msg}`, errorCode: 'NETWORK' };
      }
      
      // Always try to read body — even on non-200
      let result: Record<string, unknown>;
      let rawBody: string;
      try {
        rawBody = await response.text();
        result = JSON.parse(rawBody);
      } catch {
        console.error('[InvitePopup] Non-JSON response', { status: response.status, body: rawBody! });
        return {
          success: false,
          error: `Server returned ${response.status} with non-JSON body: ${rawBody!.slice(0, 200)}`,
          errorCode: 'BAD_RESPONSE',
        };
      }
      
      console.log('[InvitePopup] confirm-referral response', {
        correlationId,
        status: response.status,
        result,
      });
      
      if (!response.ok || result.success === false) {
        const errorMsg = (result.error as string) || (result.errorMessage as string) || `Server error (${response.status})`;
        const errorCode = (result.errorCode as string) || 'UNKNOWN';
        const stepFailed = (result.step as string) || (result.stepFailed as string) || 'unknown';
        console.error('[InvitePopup] Referral failed', { errorCode, stepFailed, errorMsg, correlationId });
        return {
          success: false,
          error: errorMsg,
          errorCode,
          stepFailed,
          steps: result.steps as { redemptionCreated: boolean; rewardGranted: boolean; notificationSent: boolean } | undefined,
        };
      }
      
      rewardGrantedRef.current = true;
      return { success: true, steps: result.steps as { redemptionCreated: boolean; rewardGranted: boolean; notificationSent: boolean } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[InvitePopup] Unexpected error in confirmReferral:', msg);
      return { success: false, error: `Client error: ${msg}`, errorCode: 'CLIENT_ERROR' };
    }
  }, [user?.id, profile?.id]);

  const handleThankYou = async () => {
    if (!profile?.id || !referral || step !== 'idle') return;

    setStep('confirming');
    setErrorDetail('');

    try {
      const result = await confirmReferral(referral.inviterUserId, referral.inviterId);

      if (!result.success) {
        setStep('error');
        // Show humans a friendly line; keep the diagnostic in console for support.
        const friendly = "We couldn't connect you two right now. Try again in a moment.";
        setErrorDetail(friendly);
        console.error('[InvitePopup] handleThankYou failed', { errorCode: result.errorCode, stepFailed: result.stepFailed, error: result.error });
        toast.error(friendly);
        return;
      }

      const steps = result.steps;
      
      if (steps?.redemptionCreated) {
        setStep('rewarding');
        await new Promise(r => setTimeout(r, 400));
      }

      if (steps?.rewardGranted) {
        setStep('notifying');
        await new Promise(r => setTimeout(r, 400));
      }

      setStep('complete');

      markReferralConfirmed();
      toast.success(`You and @${referral.inviterUsername} are now friends!`);

      // Instantly refresh leaderboard data
      queryClient.invalidateQueries({ queryKey: ['invite-leaderboard'] });

      setTimeout(() => {
        setVisible(false);
        cleanupReferralStorage();
        if (location.pathname.startsWith('/invite/')) {
          navigate('/home');
        }
      }, 1500);
    } catch (error) {
      setStep('error');
      console.error('[InvitePopup] handleThankYou exception', error);
      setErrorDetail("Something went wrong on our end. Please try again.");
      toast.error("Something went wrong. Please try again.");
    }
  };

  const handleRetry = () => {
    setStep('idle');
    setErrorDetail('');
  };

  if (!visible || !referral) return null;

  const currentStepInfo = STEP_INFO[step];
  const isProcessing = step !== 'idle' && step !== 'error';
  const isComplete = step === 'complete';
  const isError = step === 'error';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
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
                {/* Inviter Avatar */}
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

                {/* Progress bar */}
                {isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3 pt-2"
                  >
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: `${currentStepInfo.progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
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
                    {errorDetail && (
                      <p className="text-[10px] text-muted-foreground font-mono break-all max-h-20 overflow-auto px-2">
                        {errorDetail}
                      </p>
                    )}
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
                
                {/* Action Button */}
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
