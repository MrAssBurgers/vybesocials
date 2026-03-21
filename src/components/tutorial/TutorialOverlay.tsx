import { useEffect, useState, useCallback, memo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
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

// Global state for menu control
let createMenuController: { open: () => void; close: () => void } | null = null;
let vybeHubController: { open: () => void; close: () => void } | null = null;

export function registerCreateMenuController(controller: { open: () => void; close: () => void } | null) {
  createMenuController = controller;
}

export function registerVYBEHubController(controller: { open: () => void; close: () => void } | null) {
  vybeHubController = controller;
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
  const navigate = useNavigate();
  const location = useLocation();
  const [spotlight, setSpotlight] = useState<SpotlightPosition | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({});
  const [elementFound, setElementFound] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [menuState, setMenuState] = useState<'none' | 'createMenu' | 'vybeHub'>('none');

  const currentStepData = steps[currentStep];

  // Close all menus
  const closeAllMenus = useCallback(() => {
    createMenuController?.close();
    vybeHubController?.close();
    // Also dispatch custom events to close menus
    window.dispatchEvent(new CustomEvent('tutorial-close-menus'));
    setMenuState('none');
  }, []);

  // Open create menu
  const openCreateMenu = useCallback(() => {
    closeAllMenus();
    setTimeout(() => {
      // Simulate click on create button
      const createBtn = document.querySelector('[data-tutorial="create-nav"]')?.closest('button');
      if (createBtn) {
        (createBtn as HTMLButtonElement).click();
      } else {
        // Fallback: dispatch custom event
        window.dispatchEvent(new CustomEvent('tutorial-open-create-menu'));
      }
      setMenuState('createMenu');
    }, 100);
  }, [closeAllMenus]);

  // Open VYBE Hub
  const openVYBEHub = useCallback(() => {
    closeAllMenus();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tutorial-open-vybe-hub'));
      setMenuState('vybeHub');
    }, 100);
  }, [closeAllMenus]);

  // Track the last navigated route to prevent re-navigation loops
  const lastNavigatedRouteRef = useRef<string | null>(null);

  // Handle step actions (navigation, menu opening)
  const executeStepAction = useCallback(async () => {
    if (!currentStepData) return;

    // Handle route navigation - only if actually on different route AND we haven't already navigated there for this step
    const targetRoute = currentStepData.requiresRoute || 
      (currentStepData.action === 'navigateToSettings' ? '/settings' : null);
    const needsNavigation = targetRoute && 
      location.pathname !== targetRoute && 
      lastNavigatedRouteRef.current !== targetRoute;
    
    if (needsNavigation) {
      setIsNavigating(true);
      closeAllMenus();
      lastNavigatedRouteRef.current = targetRoute;
      navigate(targetRoute, { replace: true });
      // Wait for navigation to complete
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Always ensure navigating is false after route check
    setIsNavigating(false);

    // Handle menu actions after navigation
    if (currentStepData.action) {
      // Small delay to let DOM settle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      switch (currentStepData.action) {
        case 'openCreateMenu':
          openCreateMenu();
          break;
        case 'openVYBEHub':
          openVYBEHub();
          break;
        case 'closeMenus':
          closeAllMenus();
          break;
        case 'navigateToSettings':
          // Already handled above via targetRoute
          break;
        case 'navigateToThemes':
          // Click on themes tab in settings
          setTimeout(() => {
            const themesBtn = document.querySelector('[data-tutorial="themes-section"]');
            if (themesBtn) {
              (themesBtn as HTMLElement).click();
            }
          }, 300);
          break;
      }
    }
  }, [currentStepData, location.pathname, navigate, closeAllMenus, openCreateMenu, openVYBEHub]);

  // Smart tooltip positioning - docks in a consistent area but dodges the spotlight
  // Mobile/tablet: bottom-center above nav, moves up if spotlight overlaps
  // Desktop: centered, moves to avoid spotlight overlap
  const calculateTooltipPosition = useCallback((
    rect: DOMRect, 
    preferredPosition: TutorialStep['position'],
    element?: Element | null
  ) => {
    const tooltipWidth = Math.min(320, window.innerWidth - 32);
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const isMobileOrTablet = layoutMode === 'mobile' || layoutMode === 'tablet';
    const centerX = Math.max(16, (viewport.width - tooltipWidth) / 2);

    if (isMobileOrTablet) {
      // Fixed center of screen on mobile
      const tooltipHeight = 320;
      const centerY = Math.max(80, (viewport.height - tooltipHeight) / 2);
      
      // Check if spotlight overlaps center position
      const spotlightOverlaps = rect.bottom > centerY && rect.top < centerY + tooltipHeight;
      
      if (spotlightOverlaps && rect.top > tooltipHeight + 40) {
        // Place above spotlight
        setTooltipPos({
          top: Math.max(60, rect.top - tooltipHeight - 20),
          left: centerX,
        });
      } else if (spotlightOverlaps) {
        // Place below spotlight
        setTooltipPos({
          top: Math.min(viewport.height - tooltipHeight - 80, rect.bottom + 20),
          left: centerX,
        });
      } else {
        setTooltipPos({
          top: centerY,
          left: centerX,
        });
      }
    } else {
      const tooltipHeight = 320;
      const defaultTop = Math.max(80, (viewport.height - tooltipHeight) / 2);
      const tooltipBottom = defaultTop + tooltipHeight;
      
      const spotlightOverlaps = rect.bottom > defaultTop && rect.top < tooltipBottom &&
        rect.right > centerX && rect.left < centerX + tooltipWidth;
      
      if (spotlightOverlaps) {
        if (rect.left > viewport.width / 2) {
          setTooltipPos({
            top: defaultTop,
            left: Math.max(16, rect.left - tooltipWidth - 30),
          });
        } else {
          setTooltipPos({
            top: defaultTop,
            left: Math.min(viewport.width - tooltipWidth - 16, rect.right + 30),
          });
        }
      } else {
        setTooltipPos({
          top: defaultTop,
          left: centerX,
        });
      }
    }
  }, [layoutMode]);

  // Minimal scroll - only if element is completely off-screen, and do it gently once
  const scrollElementIntoView = useCallback((element: Element): Promise<void> => {
    return new Promise((resolve) => {
      const rect = element.getBoundingClientRect();
      const vh = window.innerHeight;
      
      // Only scroll if the element is truly off-screen (not just partially)
      const isOffScreen = rect.bottom < 0 || rect.top > vh;
      
      if (isOffScreen) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
        setTimeout(resolve, 300);
      } else {
        resolve();
      }
    });
  }, []);

  const updateSpotlight = useCallback(async () => {
    if (!currentStepData || isNavigating) return;

    // Wait a bit for menus to open
    if (currentStepData.action === 'openCreateMenu' || currentStepData.action === 'openVYBEHub') {
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const target = document.querySelector(currentStepData.targetSelector);
    
    if (target) {
      // Only scroll if element is completely off-screen
      await scrollElementIntoView(target);
      
      const rect = target.getBoundingClientRect();
      const padding = 6;
      const borderRadius = Math.min(12, rect.height / 2, rect.width / 2);
      
      setSpotlight({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });
      setElementFound(true);
      calculateTooltipPosition(rect, currentStepData.position, target);
    } else {
      // Element not found - use same stable dock position
      setSpotlight(null);
      setElementFound(false);
      const tooltipWidth = Math.min(320, window.innerWidth - 32);
      const tooltipHeight = 320;
      const isMobileOrTablet = layoutMode === 'mobile' || layoutMode === 'tablet';
      const centerX = Math.max(16, (window.innerWidth - tooltipWidth) / 2);
      const centerY = Math.max(80, (window.innerHeight - tooltipHeight) / 2);
      
      setTooltipPos({
        top: centerY,
        left: centerX,
      });
    }
    
    // Broadcast highlighted nav item for BottomNav to pick up
    if (currentStepData?.highlightNav) {
      window.dispatchEvent(new CustomEvent('tutorial-highlight-nav', { 
        detail: { navId: currentStepData.highlightNav } 
      }));
    } else {
      window.dispatchEvent(new CustomEvent('tutorial-highlight-nav', { 
        detail: { navId: null } 
      }));
    }
  }, [currentStepData, calculateTooltipPosition, scrollElementIntoView, isNavigating]);

  // Execute step action when step changes
  useEffect(() => {
    if (!isOpen || !currentStepData) return;
    
    // Reset navigation tracking for new step
    lastNavigatedRouteRef.current = null;
    executeStepAction();
  }, [isOpen, currentStep, executeStepAction]);

  // Update spotlight after action is executed
  useEffect(() => {
    if (!isOpen) return;

    // Initial update with delay to let DOM and menus settle
    const delay = currentStepData?.action ? 500 : 150;
    const initialTimeout = setTimeout(updateSpotlight, delay);

    // Only update on resize, NOT on scroll (prevents constant repositioning)
    const handleResize = () => {
      setTimeout(updateSpotlight, 50);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initialTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, currentStep, updateSpotlight, currentStepData?.action]);

  const handleNext = () => {
    haptics.tap();
    // Clear nav highlight when finishing tutorial
    if (currentStep === totalSteps - 1) {
      window.dispatchEvent(new CustomEvent('tutorial-highlight-nav', { detail: { navId: null } }));
    }
    onNext();
  };

  const handlePrev = () => {
    haptics.tap();
    // Close menus when going back
    if (menuState !== 'none') {
      closeAllMenus();
    }
    onPrev();
  };

  const handleSkip = () => {
    haptics.tap();
    closeAllMenus();
    // Clear nav highlight
    window.dispatchEvent(new CustomEvent('tutorial-highlight-nav', { detail: { navId: null } }));
    onSkip();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] pointer-events-auto"
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
                  animate={{ 
                    x: spotlight.left, 
                    y: spotlight.top, 
                    width: spotlight.width, 
                    height: spotlight.height,
                    opacity: 1,
                  }}
                  initial={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  rx="12"
                  ry="12"
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
            fill="rgba(0, 0, 0, 0.55)"
            mask="url(#tutorial-spotlight-mask)"
          />
        </svg>

        {/* Spotlight glow effect */}
        {spotlight && (
          <motion.div
            animate={{ 
              opacity: 1, 
              top: spotlight.top - 3,
              left: spotlight.left - 3,
              width: spotlight.width + 6,
              height: spotlight.height + 6,
            }}
            initial={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute rounded-xl pointer-events-none"
            style={{
              boxShadow: '0 0 0 2px hsl(var(--primary) / 0.8), 0 0 30px hsl(var(--primary) / 0.4)',
            }}
          />
        )}

        {/* Skip button - top right */}
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[100000] flex items-center gap-2 px-4 py-2.5 rounded-full bg-card/95 backdrop-blur-xl border border-border text-sm font-medium hover:bg-card transition-colors shadow-2xl"
          onClick={handleSkip}
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Skip Tutorial</span>
        </motion.button>

        {/* Navigation indicator - only show briefly during actual navigation */}
        <AnimatePresence>
          {isNavigating && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[100001] flex items-center justify-center pointer-events-none"
            >
              <div className="p-4 rounded-2xl bg-card/95 backdrop-blur-xl border border-primary/30 shadow-2xl flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-foreground">Loading...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tooltip */}
        {!isNavigating && (
          <motion.div
            key="tutorial-tooltip"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              top: tooltipPos.top,
              bottom: tooltipPos.bottom,
              left: tooltipPos.left,
              right: tooltipPos.right,
            }}
            transition={{ 
              type: 'spring', 
              stiffness: 200, 
              damping: 28,
              opacity: { duration: 0.2 },
            }}
            className="absolute z-[100000] w-[calc(100%-32px)] max-w-[360px] pointer-events-auto"
          >
            <div className="relative p-6 rounded-3xl shadow-2xl border border-primary/30 bg-card/98 backdrop-blur-2xl overflow-hidden">
              {/* Gradient glow background */}
              <div className="absolute -inset-1 bg-gradient-to-br from-primary/20 via-transparent to-accent/20 rounded-3xl blur-xl opacity-60 pointer-events-none" />
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                    <VybeMiniIcon size={18} showSparkles />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground tracking-wide">
                    Step {currentStep + 1} of {totalSteps}
                  </span>
                </div>
                
                {/* Step dots */}
                <div className="flex gap-1.5 flex-wrap max-w-[100px] justify-end">
                  {steps.slice(0, 10).map((_, idx) => (
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
                  {steps.length > 10 && (
                    <span className="text-[10px] text-muted-foreground">+{steps.length - 10}</span>
                  )}
                </div>
              </div>

              {/* Content - crossfade on step change */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <h3 className="text-lg font-bold mb-2 text-foreground">
                    {currentStepData?.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {currentStepData?.description}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Element not found warning - only show if NOT welcome step */}
              {!elementFound && currentStepData?.id !== 'welcome' && (
                <div className="mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2 text-xs text-amber-600">
                  <HelpCircle className="w-4 h-4 flex-shrink-0" />
                  <span>This feature may be available on a different screen or view.</span>
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
                      <VybeMiniIcon size={18} showSparkles />
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
        )}
      </motion.div>
    </AnimatePresence>
  );
});
