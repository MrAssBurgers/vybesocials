import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { useTutorialLayout, TutorialLayoutMode } from '@/hooks/useTutorialLayout';
import { TutorialStep, getStepsForLayout } from './tutorialSteps';
import { TutorialOverlay } from './TutorialOverlay';
import LocalErrorBoundary from '@/components/error/LocalErrorBoundary';

interface TutorialContextType {
  isOpen: boolean;
  isLoading: boolean;
  hasCompleted: boolean;
  currentStep: number;
  steps: TutorialStep[];
  layoutMode: TutorialLayoutMode;
  totalSteps: number;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => Promise<void>;
  completeTutorial: () => Promise<void>;
  openTutorial: () => void;
  closeTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | null>(null);

export function useTutorialContext() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorialContext must be used within a TutorialProvider');
  }
  return context;
}

// Safe hook that doesn't throw if used outside provider
export function useTutorial() {
  return useContext(TutorialContext);
}

const DEBUG_TUTORIAL = import.meta.env.DEV && false;

function logTutorial(...args: unknown[]) {
  if (DEBUG_TUTORIAL) console.log('[Tutorial]', ...args);
}

/**
 * TutorialProvider - Manages tutorial state for first-time users
 *
 * CRITICAL RULES:
 * 1. Tutorial shows ONCE on FIRST authenticated app load after onboarding
 * 2. hasCompleted = false by default until user completes OR skips
 * 3. Referral flows MUST NOT affect tutorial state
 * 4. Tutorial triggers based on: onboarding_completed=true AND tutorial_completed=false AND tutorial_skipped=false
 */
export function TutorialProvider({ children }: { children: ReactNode }) {
  const { profile, user } = useAuth();
  const location = useLocation();
  const { layoutMode } = useTutorialLayout();
  
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [onboardingJustCompleted, setOnboardingJustCompleted] = useState(false);
  const hasTriggeredRef = useRef(false);
  const lastProfileIdRef = useRef<string | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const checkTutorialStatusRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  // Get steps based on current layout
  const steps = getStepsForLayout(layoutMode);

  // Check tutorial status - can be called multiple times
  const checkTutorialStatus = useCallback(async (force = false) => {
    // Wait for authenticated user with profile
    if (!user?.id || !profile?.id) {
      setIsLoading(false);
      return;
    }

    // CRITICAL: Only auto-trigger tutorial on /home or /invite/* (where Home renders inside InviteRedeem)
    // Prevents flashing on auth/login pages
    const currentPath = location.pathname;
    const isOnHomeOrInvite = currentPath === '/home' || currentPath.startsWith('/invite/');
    if (!isOnHomeOrInvite && !force) {
      logTutorial('Not on /home or invite flow, deferring tutorial check. Path:', currentPath);
      setIsLoading(false);
      return;
    }

    // Reset check if profile changed (new user)
    if (lastProfileIdRef.current !== profile.id) {
      logTutorial('New profile detected, resetting state');
      lastProfileIdRef.current = profile.id;
      hasTriggeredRef.current = false;
    }

    // Skip if already triggered (unless forced)
    if (hasTriggeredRef.current && !force) return;

    logTutorial('Checking tutorial status for user:', profile.id);

    try {
      const { data, error } = await db
        .from('profiles')
        .select('tutorial_completed, tutorial_skipped, onboarding_completed')
        .eq('id', profile.id)
        .maybeSingle();

      if (error) {
        if (import.meta.env.DEV) console.error('[Tutorial] Error fetching status:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const tutorialCompleted = data.tutorial_completed ?? false;
        const tutorialSkipped = data.tutorial_skipped ?? false;
        const onboardingCompleted = data.onboarding_completed ?? false;
        const completed = tutorialCompleted || tutorialSkipped;
        
        logTutorial('Status:', { tutorialCompleted, tutorialSkipped, onboardingCompleted, completed });
        
        setHasCompleted(completed);

        // CRITICAL: Auto-trigger tutorial for first-time users
        // Conditions: onboarding done + tutorial not done + not manually opened + not already triggered
        if (onboardingCompleted && !completed && !isManualOpen && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          logTutorial('Auto-triggering tutorial for first-time user');
          // Delay to let UI fully render after navigation
          setTimeout(() => {
            // Guard: only open if the first step's target element exists in DOM
            const firstStep = getStepsForLayout(layoutMode)[0];
            const targetEl = firstStep ? document.querySelector(firstStep.targetSelector) : null;
            if (!targetEl) {
              logTutorial('First step target not found, retrying in 1s');
              setTimeout(() => {
                setIsOpen(true);
                setIsLoading(false);
              }, 1000);
            } else {
              setIsOpen(true);
              setIsLoading(false);
              logTutorial('Tutorial opened');
            }
          }, 1500);
        }
      }
    } catch (error) {
      console.error('[Tutorial] Error checking status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, profile?.id, isManualOpen, location.pathname, layoutMode]);

  checkTutorialStatusRef.current = checkTutorialStatus;

  // Initial check and re-check when profile changes
  useEffect(() => {
    checkTutorialStatus();
  }, [checkTutorialStatus]);

  // CRITICAL: Set up interval to recheck tutorial status for new accounts
  // This ensures tutorial triggers even if onboarding_completed is set after initial load
  useEffect(() => {
    if (!user?.id || !profile?.id) return;
    if (hasTriggeredRef.current || hasCompleted) return;

    // Poll every 2 seconds for up to 30 seconds after auth
    let attempts = 0;
    const maxAttempts = 15;

    checkIntervalRef.current = setInterval(() => {
      attempts++;
      logTutorial('Recheck attempt', attempts);

      void checkTutorialStatusRef.current(true);

      if (attempts >= maxAttempts || hasTriggeredRef.current || hasCompleted) {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
      }
    }, 2000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [user?.id, profile?.id, hasCompleted]);

  // Listen for onboarding-completed event
  useEffect(() => {
    const handleOnboardingComplete = () => {
      logTutorial('Onboarding completed event received');
      setOnboardingJustCompleted(true);
      // Try immediately if profile is already available
      setTimeout(() => checkTutorialStatus(true), 500);
    };

    window.addEventListener('onboarding-completed', handleOnboardingComplete);
    return () => window.removeEventListener('onboarding-completed', handleOnboardingComplete);
  }, [checkTutorialStatus]);

  // When profile becomes available after onboarding, trigger tutorial check
  useEffect(() => {
    if (!onboardingJustCompleted || !user?.id || !profile?.id) return;
    if (hasTriggeredRef.current) return;
    
    logTutorial('Profile now available after onboarding, triggering check');
    setOnboardingJustCompleted(false);
    checkTutorialStatus(true);
  }, [onboardingJustCompleted, user?.id, profile?.id, checkTutorialStatus]);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      completeTutorial();
    }
  }, [currentStep, steps.length]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const skipTutorial = useCallback(async () => {
    if (!profile?.id) return;

    logTutorial('Skipping tutorial');
    
    try {
      // FIRST: Persist to database
      const { error } = await db
        .from('profiles')
        .update({ tutorial_skipped: true })
        .eq('id', profile.id);

      if (error) {
        console.error('[Tutorial] Error skipping:', error);
        return;
      }

      // THEN: Update local state
      setHasCompleted(true);
      setIsOpen(false);
      setCurrentStep(0);
      setIsManualOpen(false);
      
      // Clear interval if running
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      
      // FINALLY: Emit event for referral popup to listen
      logTutorial('Tutorial skipped, dispatching event');
      window.dispatchEvent(new CustomEvent('tutorial-completed'));
    } catch (error) {
      console.error('[Tutorial] Error skipping:', error);
    }
  }, [profile?.id]);

  const completeTutorial = useCallback(async () => {
    if (!profile?.id) return;

    logTutorial('Completing tutorial');
    
    try {
      // FIRST: Persist to database
      const { error } = await db
        .from('profiles')
        .update({ tutorial_completed: true })
        .eq('id', profile.id);

      if (error) {
        console.error('[Tutorial] Error completing:', error);
        return;
      }

      // THEN: Update local state
      setHasCompleted(true);
      setIsOpen(false);
      setCurrentStep(0);
      setIsManualOpen(false);
      
      // Clear interval if running
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      
      // FINALLY: Emit event for referral popup to listen
      logTutorial('Tutorial completed, dispatching event');
      window.dispatchEvent(new CustomEvent('tutorial-completed'));
    } catch (error) {
      console.error('[Tutorial] Error completing:', error);
    }
  }, [profile?.id]);

  const openTutorial = useCallback(() => {
    setIsManualOpen(true);
    setCurrentStep(0);
    setIsOpen(true);
  }, []);

  const closeTutorial = useCallback(() => {
    setIsOpen(false);
    setCurrentStep(0);
    setIsManualOpen(false);
  }, []);

  // Listen for open-tutorial event from Settings
  useEffect(() => {
    const handleOpenTutorial = () => openTutorial();
    window.addEventListener('open-tutorial', handleOpenTutorial);
    return () => window.removeEventListener('open-tutorial', handleOpenTutorial);
  }, [openTutorial]);

  const contextValue: TutorialContextType = {
    isOpen,
    isLoading,
    hasCompleted,
    currentStep,
    steps,
    layoutMode,
    totalSteps: steps.length,
    nextStep,
    prevStep,
    skipTutorial,
    completeTutorial,
    openTutorial,
    closeTutorial,
  };

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      <LocalErrorBoundary label="TutorialOverlay">
        <TutorialOverlay
          isOpen={isOpen && !isLoading}
          currentStep={currentStep}
          steps={steps}
          layoutMode={layoutMode}
          totalSteps={steps.length}
          onNext={nextStep}
          onPrev={prevStep}
          onSkip={skipTutorial}
        />
      </LocalErrorBoundary>
    </TutorialContext.Provider>
  );
}
