import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
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

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { layoutMode } = useTutorialLayout();
  
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);

  // Get steps based on current layout
  const steps = getStepsForLayout(layoutMode);

  // Check tutorial status on mount
  useEffect(() => {
    const checkTutorialStatus = async () => {
      if (!profile?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('profiles')
          .select('tutorial_completed, tutorial_skipped, onboarding_completed')
          .eq('id', profile.id)
          .single();

        if (data) {
          const tutorialCompleted = (data as any).tutorial_completed ?? false;
          const tutorialSkipped = (data as any).tutorial_skipped ?? false;
          const completed = tutorialCompleted || tutorialSkipped;
          setHasCompleted(completed);

          // Auto-show tutorial after onboarding if not completed/skipped
          if (data.onboarding_completed && !completed && !isManualOpen) {
            // Delay to let the UI fully render
            setTimeout(() => setIsOpen(true), 1500);
          }
        }
      } catch (error) {
        console.error('Error checking tutorial status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkTutorialStatus();
  }, [profile?.id, isManualOpen]);

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

    try {
      await supabase
        .from('profiles')
        .update({ tutorial_skipped: true })
        .eq('id', profile.id);

      setHasCompleted(true);
      setIsOpen(false);
      setCurrentStep(0);
      setIsManualOpen(false);
    } catch (error) {
      console.error('Error skipping tutorial:', error);
    }
  }, [profile?.id]);

  const completeTutorial = useCallback(async () => {
    if (!profile?.id) return;

    try {
      await supabase
        .from('profiles')
        .update({ tutorial_completed: true })
        .eq('id', profile.id);

      setHasCompleted(true);
      setIsOpen(false);
      setCurrentStep(0);
      setIsManualOpen(false);
    } catch (error) {
      console.error('Error completing tutorial:', error);
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
