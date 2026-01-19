import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Users, MessageCircle, Phone, Sparkles, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { useAccessibility } from '@/providers/AccessibilityProvider';

const INTRO_SHOWN_KEY = 'vybe_intro_completed';

// Delay before showing intro to ensure splash screen completes first
const INTRO_DELAY_MS = 800;

interface IntroFlowProps {
  onComplete: () => void;
  onSkip: () => void;
}

const slides = [
  {
    id: 'welcome',
    title: 'Welcome to VYBE',
    subtitle: 'A social app built around presence, not noise.',
    icon: null, // Will show VYBELogo
  },
  {
    id: 'features',
    title: 'Built Different',
    bullets: [
      { icon: Users, text: 'See when friends are actually here' },
      { icon: MessageCircle, text: 'Chats that feel alive' },
      { icon: Phone, text: 'Calls that just work' },
      { icon: Sparkles, text: 'AI that adapts to you' },
    ],
  },
  {
    id: 'community',
    title: 'By the Community',
    subtitle: 'Built for the community, by the community.',
    description: 'No spam. No pressure. Just real connection.',
    icon: Heart,
  },
];

export function IntroFlow({ onComplete, onSkip }: IntroFlowProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const { reduceMotion } = useAccessibility();
  
  // Delay intro appearance to ensure splash screen is fully gone
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, INTRO_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  
  const isLastSlide = currentSlide === slides.length - 1;
  
  const handleNext = () => {
    if (isLastSlide) {
      markIntroComplete();
      onComplete();
    } else {
      setCurrentSlide(prev => prev + 1);
    }
  };
  
  const handleSkip = () => {
    markIntroComplete();
    onSkip();
  };
  
  const slide = slides[currentSlide];
  
  const variants = reduceMotion ? {} : {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
  };
  
  // Show nothing until ready (splash screen complete)
  if (!isReady) {
    return (
      <div className="fixed inset-0 z-[200] bg-background" />
    );
  }
  
  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={reduceMotion ? {} : { rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-full h-full opacity-20"
        >
          <div className="w-full h-full gradient-animated rounded-full blur-3xl" />
        </motion.div>
        <motion.div
          animate={reduceMotion ? {} : { rotate: -360 }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/2 -right-1/2 w-full h-full opacity-15"
        >
          <div className="w-full h-full gradient-animated rounded-full blur-3xl" />
        </motion.div>
      </div>
      
      {/* Skip button */}
      <div className="relative z-10 flex justify-end p-4">
        <button
          onClick={handleSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1"
        >
          Skip
        </button>
      </div>
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="w-full max-w-md text-center space-y-8"
          >
            {/* Icon or Logo */}
            {slide.id === 'welcome' ? (
              <div className="flex justify-center">
                <VYBELogo size="splash" showText={false} />
              </div>
            ) : slide.icon ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="flex justify-center"
              >
                <div className="w-24 h-24 rounded-full gradient-animated flex items-center justify-center">
                  <slide.icon className="w-12 h-12 text-white" />
                </div>
              </motion.div>
            ) : null}
            
            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-display font-bold">
              {slide.title}
            </h1>
            
            {/* Subtitle */}
            {slide.subtitle && (
              <p className="text-lg text-muted-foreground">
                {slide.subtitle}
              </p>
            )}
            
            {/* Bullets */}
            {slide.bullets && (
              <div className="space-y-4 text-left">
                {slide.bullets.map((bullet, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.1 }}
                    className="flex items-center gap-4 p-3 rounded-xl bg-muted/30 backdrop-blur"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <bullet.icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-foreground">{bullet.text}</span>
                  </motion.div>
                ))}
              </div>
            )}
            
            {/* Description */}
            {slide.description && (
              <p className="text-muted-foreground">
                {slide.description}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Bottom navigation */}
      <div className="relative z-10 p-6 space-y-4">
        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentSlide 
                  ? 'w-6 bg-primary' 
                  : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
        
        {/* Action buttons */}
        {isLastSlide ? (
          <div className="space-y-3">
            <Button
              className="w-full gradient-animated text-white"
              size="lg"
              onClick={onComplete}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Create Account
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              size="lg"
              onClick={() => {
                markIntroComplete();
                onSkip();
              }}
            >
              Log In
            </Button>
          </div>
        ) : (
          <Button
            className="w-full gradient-animated text-white"
            size="lg"
            onClick={handleNext}
          >
            Continue
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}

// Storage helpers
export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(INTRO_SHOWN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markIntroComplete(): void {
  try {
    localStorage.setItem(INTRO_SHOWN_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

export function resetIntro(): void {
  try {
    localStorage.removeItem(INTRO_SHOWN_KEY);
  } catch {
    // Ignore storage errors
  }
}
