import { useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Sparkles, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { TutorialStep, getLayoutLabel } from './tutorialSteps';
import { TutorialLayoutMode } from '@/hooks/useTutorialLayout';

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
}

interface TutorialOverlayProps {
  isOpen: boolean;
  currentStep: number;
  steps: TutorialStep[];
  layoutMode: TutorialLayoutMode;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export const TutorialOverlay = memo(function TutorialOverlay({
  isOpen,
  currentStep,
  steps,
  layoutMode,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: TutorialOverlayProps) {
  const [spotlight, setSpotlight] = useState<SpotlightPosition | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({});
  const [elementFound, setElementFound] = useState(true);

  const currentStepData = steps[currentStep];

  const calculateTooltipPosition = useCallback((
    rect: DOMRect, 
    preferredPosition: TutorialStep['position']
  ) => {
    const tooltipWidth = Math.min(320, window.innerWidth - 32);
    const tooltipHeight = 200;
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
          left: Math.max(16, Math.min(
            rect.left + rect.width / 2 - tooltipWidth / 2, 
            viewport.width - tooltipWidth - 16
          )),
        };
        // Flip to top if not enough space below
        if (pos.top! + tooltipHeight > viewport.height - 100) {
          pos.top = rect.top - tooltipHeight - gap;
        }
        break;
      
      case 'top':
        pos = {
          top: rect.top - tooltipHeight - gap,
          left: Math.max(16, Math.min(
            rect.left + rect.width / 2 - tooltipWidth / 2, 
            viewport.width - tooltipWidth - 16
          )),
        };
        // Flip to bottom if not enough space above
        if (pos.top! < 100) {
          pos.top = rect.bottom + gap;
        }
        break;
      
      case 'left':
        pos = {
          top: Math.max(16, rect.top + rect.height / 2 - tooltipHeight / 2),
          left: rect.left - tooltipWidth - gap,
        };
        // Flip to right if not enough space
        if (pos.left! < 16) {
          pos.left = rect.right + gap;
        }
        break;
      
      case 'right':
        pos = {
          top: Math.max(16, rect.top + rect.height / 2 - tooltipHeight / 2),
          left: rect.right + gap,
        };
        // Flip to left if not enough space
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
    if (pos.left && pos.left < 16) pos.left = 16;
    if (pos.left && pos.left + tooltipWidth > viewport.width - 16) {
      pos.left = viewport.width - tooltipWidth - 16;
    }

    setTooltipPos(pos);
  }, []);

  const updateSpotlight = useCallback(() => {
    if (!currentStepData) return;

    const target = document.querySelector(currentStepData.targetSelector);
    
    if (target) {
      // Scroll element into view smoothly before highlighting
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
      
      // Wait for scroll to complete before calculating position
      setTimeout(() => {
        const rect = target.getBoundingClientRect();
        const padding = 8;
        
        setSpotlight({
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        });
        setElementFound(true);
        calculateTooltipPosition(rect, currentStepData.position);
      }, 300);
    } else {
      // Element not found - show centered tooltip
      setSpotlight(null);
      setElementFound(false);
      setTooltipPos({
        top: window.innerHeight / 2 - 100,
        left: Math.max(16, window.innerWidth / 2 - 160),
      });
    }
  }, [currentStepData, calculateTooltipPosition]);

  useEffect(() => {
    if (!isOpen) return;

    // Initial update with slight delay to let DOM settle
    const initialTimeout = setTimeout(updateSpotlight, 100);

    // Update on window changes
    const handleChange = () => updateSpotlight();
    window.addEventListener('resize', handleChange);
    window.addEventListener('scroll', handleChange, true);

    // Observe for DOM changes (elements appearing/disappearing)
    const observer = new MutationObserver(() => {
      setTimeout(updateSpotlight, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(initialTimeout);
      window.removeEventListener('resize', handleChange);
      window.removeEventListener('scroll', handleChange, true);
      observer.disconnect();
    };
  }, [isOpen, currentStep, updateSpotlight]);

  const handleNext = () => {
    haptics.tap();
    onNext();
  };

  const handlePrev = () => {
    haptics.tap();
    onPrev();
  };

  const handleSkip = () => {
    haptics.tap();
    onSkip();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] pointer-events-auto"
      >
        {/* Dark overlay with spotlight cutout */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            <mask id="tutorial-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlight && (
                <motion.rect
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
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
            fill="rgba(0, 0, 0, 0.85)"
            mask="url(#tutorial-spotlight-mask)"
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
              boxShadow: '0 0 0 4px hsl(var(--primary) / 0.6), 0 0 60px hsl(var(--primary) / 0.5)',
            }}
          />
        )}

        {/* Skip button - top right */}
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[10000] flex items-center gap-2 px-4 py-2.5 rounded-full bg-background/95 backdrop-blur-xl border border-border text-sm font-medium hover:bg-background transition-colors shadow-xl"
          onClick={handleSkip}
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Skip Tutorial</span>
        </motion.button>

        {/* Tooltip */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 15, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -15, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute z-[10000] w-[calc(100%-32px)] max-w-[340px] pointer-events-auto"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            right: tooltipPos.right,
            bottom: tooltipPos.bottom,
          }}
        >
          <div className="liquid-glass-card p-5 rounded-2xl shadow-2xl border-2 border-primary/40 bg-background/98 backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground tracking-wide">
                  Step {currentStep + 1} of {totalSteps}
                </span>
              </div>
              
              {/* Step dots */}
              <div className="flex gap-1.5">
                {steps.map((_, idx) => (
                  <motion.div
                    key={idx}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-300',
                      idx === currentStep 
                        ? 'bg-primary scale-125' 
                        : idx < currentStep 
                          ? 'bg-primary/60' 
                          : 'bg-muted-foreground/30'
                    )}
                    animate={idx === currentStep ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                  />
                ))}
              </div>
            </div>

            {/* Content */}
            <h3 className="text-lg font-bold mb-2 text-foreground">
              {currentStepData?.title}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              {currentStepData?.description}
            </p>

            {/* Element not found warning */}
            {!elementFound && (
              <div className="mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2 text-xs text-amber-600">
                <HelpCircle className="w-4 h-4 flex-shrink-0" />
                <span>This element may not be visible in the current view.</span>
              </div>
            )}

            {/* Layout indicator */}
            <div className="mb-4 px-3 py-2 bg-primary/10 rounded-full inline-flex items-center gap-2 text-xs font-medium text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              {getLayoutLabel(layoutMode)} Guide
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="flex items-center gap-1 h-11 px-4"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              <Button
                size="sm"
                onClick={handleNext}
                className="flex items-center gap-1 gradient-animated h-11 px-6 font-semibold"
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
});
