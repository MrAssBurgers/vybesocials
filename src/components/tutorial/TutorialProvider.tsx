import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useTutorialLayout, TutorialLayoutMode } from '@/hooks/useTutorialLayout';
import { TutorialStep, getStepsForLayout } from './tutorialSteps';
import { TutorialOverlay } from './TutorialOverlay';

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
  const { layoutMode } = useTutorialLayout();
  
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const hasCheckedRef = useRef(false);
  const hasTriggeredRef = useRef(false);

  // Get steps based on current layout
  const steps = getStepsForLayout(layoutMode);

  // Check tutorial status on mount and when profile changes
  useEffect(() => {
    const checkTutorialStatus = async () => {
      // Wait for authenticated user with profile
      if (!user?.id || !profile?.id) {
        setIsLoading(false);
        return;
      }

      // Only check once per session to avoid race conditions
      if (hasCheckedRef.current) return;
      hasCheckedRef.current = true;

      console.log('[Tutorial] Checking tutorial status for user:', profile.id);

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('tutorial_completed, tutorial_skipped, onboarding_completed')
          .eq('id', profile.id)
          .single();

        if (error) {
          console.error('[Tutorial] Error fetching status:', error);
          setIsLoading(false);
          return;
        }

        if (data) {
          const tutorialCompleted = data.tutorial_completed ?? false;
          const tutorialSkipped = data.tutorial_skipped ?? false;
          const onboardingCompleted = data.onboarding_completed ?? false;
          const completed = tutorialCompleted || tutorialSkipped;
          
          console.log('[Tutorial] Status:', { tutorialCompleted, tutorialSkipped, onboardingCompleted, completed });
          
          setHasCompleted(completed);

          // CRITICAL: Auto-trigger tutorial for first-time users
          // Conditions: onboarding done + tutorial not done + not manually opened + not already triggered
          if (onboardingCompleted && !completed && !isManualOpen && !hasTriggeredRef.current) {
            hasTriggeredRef.current = true;
            console.log('[Tutorial] Auto-triggering tutorial for first-time user');
            // Delay to let UI fully render after navigation
            setTimeout(() => {
              setIsOpen(true);
              console.log('[Tutorial] Tutorial opened');
            }, 1500);
          }
        }
      } catch (error) {
        console.error('[Tutorial] Error checking status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkTutorialStatus();
  }, [user?.id, profile?.id, isManualOpen]);

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

    console.log('[Tutorial] Skipping tutorial');
    
    try {
      await supabase
        .from('profiles')
        .update({ tutorial_skipped: true })
        .eq('id', profile.id);

      setHasCompleted(true);
      setIsOpen(false);
      setCurrentStep(0);
      setIsManualOpen(false);
      
      // Emit event for referral popup to listen
      window.dispatchEvent(new CustomEvent('tutorial-completed'));
      console.log('[Tutorial] Tutorial skipped, event dispatched');
    } catch (error) {
      console.error('[Tutorial] Error skipping:', error);
    }
  }, [profile?.id]);

  const completeTutorial = useCallback(async () => {
    if (!profile?.id) return;

    console.log('[Tutorial] Completing tutorial');
    
    try {
      await supabase
        .from('profiles')
        .update({ tutorial_completed: true })
        .eq('id', profile.id);

      setHasCompleted(true);
      setIsOpen(false);
      setCurrentStep(0);
      setIsManualOpen(false);
      
      // Emit event for referral popup to listen
      window.dispatchEvent(new CustomEvent('tutorial-completed'));
      console.log('[Tutorial] Tutorial completed, event dispatched');
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
    </TutorialContext.Provider>
  );
}
