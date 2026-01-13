import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTutorial, TutorialStep } from '@/hooks/useTutorial';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

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

export function TutorialOverlay() {
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
    closeTutorial,
  } = useTutorial();

  const [spotlight, setSpotlight] = useState<SpotlightPosition | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({});

  const currentStepData = steps[currentStep];

  // Find and highlight the target element
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

      // Calculate tooltip position based on step preference and viewport
      calculateTooltipPosition(rect, currentStepData.position);
    } else {
      // If element not found, show tooltip in center
      setSpotlight(null);
      setTooltipPos({
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
        transform: 'translate(-50%, -50%)',
      });
    }
  }, [currentStepData]);

  const calculateTooltipPosition = (rect: DOMRect, preferredPosition: string) => {
    const tooltipWidth = Math.min(320, window.innerWidth - 32);
    const tooltipHeight = 160;
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
        // If not enough space below, flip to top
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
        // If not enough space above, flip to bottom
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

    // Ensure tooltip stays within viewport
    if (pos.top && pos.top < 16) pos.top = 16;
    if (pos.top && pos.top + tooltipHeight > viewport.height - 16) {
      pos.top = viewport.height - tooltipHeight - 100;
    }

    setTooltipPos(pos);
  };

  // Update spotlight when step changes or window resizes
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
            fill="rgba(0, 0, 0, 0.75)"
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
              boxShadow: '0 0 0 4px hsl(var(--primary) / 0.5), 0 0 30px hsl(var(--primary) / 0.3)',
            }}
          />
        )}

        {/* Skip button - always visible */}
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[101] flex items-center gap-2 px-3 py-2 rounded-full bg-background/90 backdrop-blur-sm border border-border text-sm font-medium hover:bg-background transition-colors"
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
          <div className="liquid-glass-card p-4 sm:p-5 rounded-2xl shadow-2xl border border-primary/20">
            {/* Step indicator */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">
                  Step {currentStep + 1} of {totalSteps}
                </span>
              </div>
              <div className="flex gap-1">
                {steps.map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-colors',
                      idx === currentStep ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Content */}
            <h3 className="text-lg font-semibold mb-2">{currentStepData?.title}</h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              {currentStepData?.description}
            </p>

            {/* Device indicator */}
            <div className="mb-4 px-2 py-1 bg-muted/50 rounded-full inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {deviceMode === 'mobile' ? 'Mobile' : deviceMode === 'tablet' ? 'Tablet' : 'Desktop'} Guide
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              <Button
                size="sm"
                onClick={handleNext}
                className="flex items-center gap-1 gradient-animated"
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
