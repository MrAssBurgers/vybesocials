import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useBreakpoint } from '@/hooks/usePlatform';

export type DeviceMode = 'mobile' | 'tablet' | 'desktop';

export interface TutorialStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  mobileOnly?: boolean;
  desktopOnly?: boolean;
  tabletOnly?: boolean;
}

// Device-specific tutorial steps
const getStepsForDevice = (device: DeviceMode): TutorialStep[] => {
  const baseSteps: TutorialStep[] = [
    {
      id: 'feed',
      targetSelector: '[data-tutorial="feed"]',
      title: 'Your Feed',
      description: 'Discover funny clips and posts from creators you follow and trending content.',
      position: 'bottom',
    },
    {
      id: 'interactions',
      targetSelector: '[data-tutorial="post-actions"]',
      title: 'Interact with Posts',
      description: 'Tap to react, comment, or share with friends. Double-tap to like!',
      position: 'top',
    },
    {
      id: 'clips',
      targetSelector: '[data-tutorial="clips"]',
      title: 'Short Clips',
      description: 'Clips are short videos — tap to unmute, hold to pause.',
      position: 'bottom',
    },
    {
      id: 'messages',
      targetSelector: '[data-tutorial="messages"]',
      title: 'Messages',
      description: 'Chat with friends here. You\'ll see when someone is in the chat or typing.',
      position: device === 'desktop' ? 'right' : 'top',
    },
    {
      id: 'calls',
      targetSelector: '[data-tutorial="calls"]',
      title: 'Video & Audio Calls',
      description: 'Start FaceTime-style calls directly from any chat.',
      position: 'top',
    },
    {
      id: 'stories',
      targetSelector: '[data-tutorial="stories"]',
      title: 'Stories',
      description: 'Post stories that disappear after 24 hours. Tap to view!',
      position: 'bottom',
    },
    {
      id: 'profile',
      targetSelector: '[data-tutorial="profile"]',
      title: 'Your Profile',
      description: 'Customize your profile, manage privacy settings, and view your posts.',
      position: device === 'desktop' ? 'left' : 'top',
    },
    {
      id: 'notifications',
      targetSelector: '[data-tutorial="notifications"]',
      title: 'Notifications',
      description: 'Control what notifications you receive in settings.',
      position: device === 'desktop' ? 'left' : 'top',
    },
  ];

  // Filter steps based on device
  return baseSteps.filter(step => {
    if (step.mobileOnly && device !== 'mobile') return false;
    if (step.desktopOnly && device !== 'desktop') return false;
    if (step.tabletOnly && device !== 'tablet') return false;
    return true;
  });
};

export function useTutorial() {
  const { profile, session } = useAuth();
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);

  // Determine device mode
  const deviceMode: DeviceMode = isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile';
  const steps = getStepsForDevice(deviceMode);

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
          const completed = data.tutorial_completed || data.tutorial_skipped;
          setHasCompleted(completed);

          // Auto-show tutorial after onboarding if not completed/skipped
          if (data.onboarding_completed && !completed && !isManualOpen) {
            // Small delay to let the UI settle
            setTimeout(() => setIsOpen(true), 1000);
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

  return {
    isOpen,
    isLoading,
    hasCompleted,
    currentStep,
    steps,
    deviceMode,
    totalSteps: steps.length,
    nextStep,
    prevStep,
    skipTutorial,
    completeTutorial,
    openTutorial,
    closeTutorial,
  };
}
