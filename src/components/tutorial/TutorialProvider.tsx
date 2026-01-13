import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
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
      id: 'stories',
      targetSelector: '[data-tutorial="stories"]',
      title: 'Stories',
      description: 'Post stories that disappear after 24 hours. Tap to view friends\' moments!',
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
      position: device === 'desktop' ? 'right' : 'top',
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

  return baseSteps;
};

interface SpotlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  transform?: string;
}

interface TutorialContextType {
  isOpen: boolean;
  isLoading: boolean;
  hasCompleted: boolean;
  currentStep: number;
  steps: TutorialStep[];
  deviceMode: DeviceMode;
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

function TutorialOverlayContent({ state }: { state: TutorialContextType }) {
  const {
    isOpen,
    isLoading,
    currentStep,
    steps,
    deviceMode,
    totalSteps,
    nextStep,
    prevStep,
    skipTutorial,
  } = state;

  const [spotlight, setSpotlight] = useState<SpotlightPosition | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({});

  const currentStepData = steps[currentStep];

  const calculateTooltipPosition = useCallback((rect: DOMRect, preferredPosition: string) => {
    const tooltipWidth = Math.min(320, window.innerWidth - 32);
    const tooltipHeight = 180;
    const gap = 16;
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    let pos: TooltipPosition = {};

    switch (preferredPosition) {
      case 'bottom':
        pos = {
          top: rect.bottom + gap,
          left: Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, viewport.width - tooltipWidth - 16)),
        };
        if (pos.top! + tooltipHeight > viewport.height - 100) {
          pos = {
            top: rect.top - tooltipHeight - gap,
            left: pos.left,
          };
        }
        break;
      case 'top':
        pos = {
          top: rect.top - tooltipHeight - gap,
          left: Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, viewport.width - tooltipWidth - 16)),
        };
        if (pos.top! < 100) {
          pos = {
            top: rect.bottom + gap,
            left: pos.left,
          };
        }
        break;
      case 'left':
        pos = {
          top: Math.max(16, rect.top + rect.height / 2 - tooltipHeight / 2),
          left: rect.left - tooltipWidth - gap,
        };
        if (pos.left! < 16) {
          pos.left = rect.right + gap;
        }
        break;
      case 'right':
        pos = {
          top: Math.max(16, rect.top + rect.height / 2 - tooltipHeight / 2),
          left: rect.right + gap,
        };
        if (pos.left! + tooltipWidth > viewport.width - 16) {
          pos.left = rect.left - tooltipWidth - gap;
        }
        break;
    }

    if (pos.top && pos.top < 16) pos.top = 16;
    if (pos.top && pos.top + tooltipHeight > viewport.height - 16) {
      pos.top = viewport.height - tooltipHeight - 100;
    }

    setTooltipPos(pos);
  }, []);

  const updateSpotlight = useCallback(() => {
    if (!currentStepData) return;

    const target = document.querySelector(currentStepData.targetSelector);
    
    if (target) {
      const rect = target.getBoundingClientRect();
      const padding = 8;
      
      setSpotlight({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });

      calculateTooltipPosition(rect, currentStepData.position);
    } else {
      setSpotlight(null);
      setTooltipPos({
        top: window.innerHeight / 2 - 90,
        left: window.innerWidth / 2 - 160,
      });
    }
  }, [currentStepData, calculateTooltipPosition]);

  useEffect(() => {
    if (!isOpen) return;

    updateSpotlight();

    const handleResize = () => updateSpotlight();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isOpen, currentStep, updateSpotlight]);

  const handleNext = () => {
    haptics.tap();
    nextStep();
  };

  const handlePrev = () => {
    haptics.tap();
    prevStep();
  };

  const handleSkip = () => {
    haptics.tap();
    skipTutorial();
  };

  if (isLoading || !isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] pointer-events-auto"
      >
        {/* Dark overlay with spotlight cutout */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlight && (
                <motion.rect
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  x={spotlight.left}
                  y={spotlight.top}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.8)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Spotlight glow effect */}
        {spotlight && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="absolute rounded-xl pointer-events-none"
            style={{
              top: spotlight.top - 4,
              left: spotlight.left - 4,
              width: spotlight.width + 8,
              height: spotlight.height + 8,
              boxShadow: '0 0 0 4px hsl(var(--primary) / 0.5), 0 0 40px hsl(var(--primary) / 0.4)',
            }}
          />
        )}

        {/* Skip button */}
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[101] flex items-center gap-2 px-3 py-2 rounded-full bg-background/95 backdrop-blur-md border border-border text-sm font-medium hover:bg-background transition-colors shadow-lg"
          onClick={handleSkip}
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Skip Tutorial</span>
        </motion.button>

        {/* Tooltip */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute z-[101] w-[calc(100%-32px)] max-w-[320px] pointer-events-auto"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            right: tooltipPos.right,
            bottom: tooltipPos.bottom,
            transform: tooltipPos.transform,
          }}
        >
          <div className="liquid-glass-card p-4 sm:p-5 rounded-2xl shadow-2xl border-2 border-primary/30 bg-background/95 backdrop-blur-xl">
            {/* Step indicator */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  Step {currentStep + 1} of {totalSteps}
                </span>
              </div>
              <div className="flex gap-1">
                {steps.map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-300',
                      idx === currentStep 
                        ? 'bg-primary scale-125' 
                        : idx < currentStep 
                          ? 'bg-primary/50' 
                          : 'bg-muted'
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Content */}
            <h3 className="text-lg font-bold mb-2 text-foreground">{currentStepData?.title}</h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              {currentStepData?.description}
            </p>

            {/* Device indicator */}
            <div className="mb-4 px-3 py-1.5 bg-primary/10 rounded-full inline-flex items-center gap-2 text-xs font-medium text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              {deviceMode === 'mobile' ? '📱 Mobile' : deviceMode === 'tablet' ? '📱 Tablet' : '💻 Desktop'} Guide
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="flex items-center gap-1 h-10"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              <Button
                size="sm"
                onClick={handleNext}
                className="flex items-center gap-1 gradient-animated h-10 px-6"
              >
                {currentStep === totalSteps - 1 ? (
                  <>
                    Get Started
                    <Sparkles className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);

  const deviceMode: DeviceMode = isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile';
  const steps = getStepsForDevice(deviceMode);

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
          // Handle potential null values from DB
          const tutorialCompleted = (data as any).tutorial_completed ?? false;
          const tutorialSkipped = (data as any).tutorial_skipped ?? false;
          const completed = tutorialCompleted || tutorialSkipped;
          setHasCompleted(completed);

          if (data.onboarding_completed && !completed && !isManualOpen) {
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
        .update({ tutorial_skipped: true } as any)
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
        .update({ tutorial_completed: true } as any)
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

  const state: TutorialContextType = {
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

  return (
    <TutorialContext.Provider value={state}>
      {children}
      <TutorialOverlayContent state={state} />
    </TutorialContext.Provider>
  );
}
