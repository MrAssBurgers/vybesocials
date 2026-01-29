import { useEffect, useState, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Sparkles, HelpCircle, Navigation } from 'lucide-react';
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

  // Handle step actions (navigation, menu opening)
  const executeStepAction = useCallback(async () => {
    if (!currentStepData) return;

    // Handle route navigation
    if (currentStepData.requiresRoute && location.pathname !== currentStepData.requiresRoute) {
      setIsNavigating(true);
      closeAllMenus();
      navigate(currentStepData.requiresRoute);
      // Wait for navigation to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsNavigating(false);
    }

    // Handle menu actions
    if (currentStepData.action) {
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
      }
    }
  }, [currentStepData, location.pathname, navigate, closeAllMenus, openCreateMenu, openVYBEHub]);

  const calculateTooltipPosition = useCallback((
    rect: DOMRect, 
    preferredPosition: TutorialStep['position'],
    element?: Element | null
  ) => {
    const tooltipWidth = Math.min(320, window.innerWidth - 32);
    const tooltipHeight = 220;
    const gap = 16;
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    // Check if this is a bottom nav step on mobile/tablet
    const isBottomNavStep = currentStepData?.highlightNav || 
      element?.closest('[data-tutorial-bottomnav]') ||
      element?.closest('nav[aria-label="Bottom navigation"]');
    
    const isMobileOrTablet = layoutMode === 'mobile' || layoutMode === 'tablet';

    // Special positioning for bottom nav items on mobile/tablet
    // Position tooltip just above the bottom nav bar
    if (isBottomNavStep && isMobileOrTablet) {
      const bottomNavHeight = 72; // Height of bottom nav bar
      // Get safe area inset if available
      const safeAreaBottom = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0'
      ) || 0;
      
      const tooltipBottom = bottomNavHeight + safeAreaBottom + gap + 8;
      
      setTooltipPos({
        bottom: tooltipBottom,
        left: Math.max(16, (viewport.width - tooltipWidth) / 2),
      });
      return;
    }

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
  }, [currentStepData?.highlightNav, layoutMode]);

  const scrollElementIntoView = useCallback((element: Element): Promise<void> => {
    return new Promise((resolve) => {
      const htmlElement = element as HTMLElement;
      const rect = element.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      
      // Check if element is already fully visible
      const isFullyVisible = 
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= viewport.height &&
        rect.right <= viewport.width;
      
      if (isFullyVisible) {
        resolve();
        return;
      }
      
      // For nav items in bottom nav or sidebar, we need special handling
      const isInBottomNav = htmlElement.closest('[data-tutorial-bottomnav]') || 
                            htmlElement.closest('nav[aria-label="Bottom navigation"]') ||
                            rect.bottom > viewport.height - 100;
      const isInSidebar = htmlElement.closest('[data-tutorial-sidebar]') ||
                          htmlElement.closest('aside');
      
      // If it's a bottom nav item that's off screen, scroll page to bottom
      if (isInBottomNav && rect.top > viewport.height) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      
      // If it's in a scrollable container, scroll that container
      const scrollableParent = htmlElement.closest('.overflow-auto, .overflow-y-auto, .overflow-x-auto, [data-radix-scroll-area-viewport]');
      if (scrollableParent) {
        const parentRect = scrollableParent.getBoundingClientRect();
        const elementOffsetTop = rect.top - parentRect.top + scrollableParent.scrollTop;
        scrollableParent.scrollTo({
          top: elementOffsetTop - parentRect.height / 2 + rect.height / 2,
          behavior: 'smooth',
        });
      }
      
      // Use scrollIntoView with appropriate settings
      element.scrollIntoView({
        behavior: 'smooth',
        block: isInBottomNav ? 'end' : isInSidebar ? 'nearest' : 'center',
        inline: 'nearest',
      });
      
      // Wait for scroll animation to complete
      setTimeout(resolve, 400);
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
      // Force element into view before highlighting
      await scrollElementIntoView(target);
      
      // Double-check visibility after scroll and adjust if needed
      let rect = target.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      
      // If still not visible, try more aggressive scrolling
      const isVisible = 
        rect.top >= -10 &&
        rect.left >= -10 &&
        rect.bottom <= viewport.height + 10 &&
        rect.right <= viewport.width + 10;
      
      if (!isVisible) {
        // For elements still not visible, scroll the main page to top
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
        
        // Wait and recalculate
        await new Promise(resolve => setTimeout(resolve, 300));
        rect = target.getBoundingClientRect();
      }
      
      const padding = 8;
      
      setSpotlight({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });
      setElementFound(true);
      calculateTooltipPosition(rect, currentStepData.position, target);
    } else {
      // Element not found - show CENTERED tooltip (for welcome step etc)
      setSpotlight(null);
      setElementFound(false);
      // Center the tooltip in the screen, above the bottom nav
      const tooltipWidth = Math.min(320, window.innerWidth - 32);
      const tooltipHeight = 280;
      setTooltipPos({
        top: (window.innerHeight - tooltipHeight) / 2 - 40, // Slightly above center to avoid bottom nav
        left: Math.max(16, (window.innerWidth - tooltipWidth) / 2),
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
    
    executeStepAction();
  }, [isOpen, currentStep, executeStepAction]);

  // Update spotlight after action is executed
  useEffect(() => {
    if (!isOpen) return;

    // Initial update with delay to let DOM and menus settle
    const delay = currentStepData?.action ? 500 : 150;
    const initialTimeout = setTimeout(updateSpotlight, delay);

    // Update on window changes
    const handleChange = () => {
      setTimeout(updateSpotlight, 50);
    };
    window.addEventListener('resize', handleChange);
    window.addEventListener('scroll', handleChange, true);

    // Observe for DOM changes (elements appearing/disappearing)
    const observer = new MutationObserver(() => {
      setTimeout(updateSpotlight, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(initialTimeout);
      window.removeEventListener('resize', handleChange);
      window.removeEventListener('scroll', handleChange, true);
      observer.disconnect();
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
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  x={spotlight.left}
                  y={spotlight.top}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx="16"
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
            fill="rgba(0, 0, 0, 0.88)"
            mask="url(#tutorial-spotlight-mask)"
          />
        </svg>

        {/* Spotlight glow effect */}
        {spotlight && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="absolute rounded-2xl pointer-events-none"
            style={{
              top: spotlight.top - 6,
              left: spotlight.left - 6,
              width: spotlight.width + 12,
              height: spotlight.height + 12,
              boxShadow: '0 0 0 4px hsl(var(--primary) / 0.7), 0 0 80px hsl(var(--primary) / 0.5), 0 0 120px hsl(var(--primary) / 0.3)',
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

        {/* Navigation indicator */}
        {isNavigating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-[10001] flex items-center justify-center"
          >
            <div className="liquid-glass p-6 rounded-2xl flex items-center gap-3">
              <Navigation className="w-5 h-5 text-primary animate-pulse" />
              <span className="text-sm font-medium">Navigating...</span>
            </div>
          </motion.div>
        )}

        {/* Tooltip */}
        {!isNavigating && (
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut', delay: 0.1 }}
            className="absolute z-[100000] w-[calc(100%-32px)] max-w-[360px] pointer-events-auto"
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
              right: tooltipPos.right,
              bottom: tooltipPos.bottom,
            }}
          >
            <div className="relative p-6 rounded-3xl shadow-2xl border border-primary/30 bg-card/98 backdrop-blur-2xl overflow-hidden">
              {/* Gradient glow background */}
              <div className="absolute -inset-1 bg-gradient-to-br from-primary/20 via-transparent to-accent/20 rounded-3xl blur-xl opacity-60 pointer-events-none" />
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

              {/* Content */}
              <h3 className="text-lg font-bold mb-2 text-foreground">
                {currentStepData?.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                {currentStepData?.description}
              </p>

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
        )}
      </motion.div>
    </AnimatePresence>
  );
});
