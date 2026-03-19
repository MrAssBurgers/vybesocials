import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Users, MessageCircle, Phone, Heart } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { supabase } from '@/integrations/supabase/client';

const INTRO_SHOWN_KEY = 'vybe_intro_completed';

// Poll interval to check if splash screen is gone
const SPLASH_CHECK_INTERVAL = 50;
const MAX_WAIT_TIME = 3000;
const MIN_WAIT_TIME = 200; // Reduced for snappier transition — splash already fades out

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
      { icon: Heart, text: 'AI that adapts to you' },
    ],
  },
  {
    id: 'community',
    title: 'Built for the Community',
    subtitle: 'By the community.',
    description: 'No spam. No pressure. Just real connection.',
    icon: Heart,
  },
];

export function IntroFlow({ onComplete, onSkip }: IntroFlowProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const { reduceMotion } = useAccessibility();
  
  // Wait for splash screen to be fully gone before showing intro
  // Also hide bottom nav while intro is showing
  useEffect(() => {
    // Hide bottom nav during intro
    document.body.classList.add('hide-bottom-nav');
    
    const startTime = Date.now();
    
    const checkSplashGone = () => {
      const elapsed = Date.now() - startTime;
      const splashVisible = document.body.classList.contains('splash-visible');
      
      // Ready when: splash is gone AND minimum wait passed, OR max wait exceeded
      if ((!splashVisible && elapsed >= MIN_WAIT_TIME) || elapsed >= MAX_WAIT_TIME) {
        setIsReady(true);
        return;
      }
      
      // Keep checking
      setTimeout(checkSplashGone, SPLASH_CHECK_INTERVAL);
    };
    
    checkSplashGone();
    
    // Cleanup - show bottom nav when intro unmounts
    return () => {
      document.body.classList.remove('hide-bottom-nav');
    };
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
  
  // Show a seamless background until ready (splash screen complete)
  if (!isReady) {
    return (
      <div className="fixed inset-0 z-[200] bg-background" />
    );
  }
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="fixed inset-0 z-[200] bg-background flex flex-col overflow-hidden"
    >
      {/* Smooth animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={reduceMotion ? {} : { rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-[150%] h-[150%] opacity-20"
        >
          <div className="w-full h-full bg-gradient-to-br from-primary/40 via-accent/30 to-primary/20 rounded-full blur-[100px]" />
        </motion.div>
        <motion.div
          animate={reduceMotion ? {} : { rotate: -360 }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/2 -right-1/2 w-[150%] h-[150%] opacity-15"
        >
          <div className="w-full h-full bg-gradient-to-tl from-accent/40 via-primary/30 to-accent/20 rounded-full blur-[100px]" />
        </motion.div>
      </div>
      
      {/* Skip button */}
      <div className="relative z-10 flex justify-end p-4 safe-area-top">
        <button
          onClick={handleSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full hover:bg-muted/50"
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
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-lg shadow-primary/25">
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
              <div className="space-y-3 text-left">
                {slide.bullets.map((bullet, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.1 }}
                    className="flex items-center gap-4 p-3 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
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
      <div className="relative z-10 p-6 pb-8 safe-area-bottom space-y-5">
        {/* Progress indicators - flat pill style matching desktop */}
        <div className="flex justify-center items-center gap-2">
          {slides.map((_, index) => (
            <div
              key={index}
              onClick={() => setCurrentSlide(index)}
              role="button"
              tabIndex={0}
              className={`transition-all duration-300 cursor-pointer ${
                index === currentSlide 
                  ? 'bg-gradient-to-r from-primary to-accent' 
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
              style={{
                display: 'block',
                height: '2px',
                width: '40px',
                borderRadius: '999px',
                flexShrink: 0,
                opacity: index === currentSlide ? 1 : 0.4,
              }}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
        
        {/* Action buttons */}
        {isLastSlide ? (
          <div className="space-y-3">
            <Button
              className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-semibold rounded-xl shadow-lg shadow-primary/25"
              size="lg"
              onClick={onComplete}
            >
              <VybeMiniIcon size={18} showSparkles className="mr-2" />
              Create Account
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-border/50 hover:bg-muted/50"
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
            className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-semibold rounded-xl shadow-lg shadow-primary/25"
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

// Storage helpers - localStorage is a fallback, database is source of truth for logged-in users
export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(INTRO_SHOWN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markIntroComplete(): void {
  try {
    // Always set localStorage as immediate fallback
    localStorage.setItem(INTRO_SHOWN_KEY, 'true');
    
    // Also persist to database for logged-in users (fire and forget)
    persistIntroToDatabase();
  } catch {
    // Ignore storage errors
  }
}

// Persist intro completion to database for logged-in users
async function persistIntroToDatabase(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase
      .from('profiles')
      .update({ intro_completed: true })
      .eq('user_id', user.id);
    
    console.log('[IntroFlow] Intro completion persisted to database');
  } catch (e) {
    console.error('[IntroFlow] Failed to persist intro to database:', e);
  }
}

// Check if user has completed intro (database first, then localStorage)
export async function checkIntroStatus(userId?: string): Promise<boolean> {
  // Check localStorage first for immediate response
  if (hasSeenIntro()) return true;
  
  // If no user ID, just use localStorage
  if (!userId) return false;
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('intro_completed')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (profile?.intro_completed) {
      // Sync to localStorage for faster checks
      localStorage.setItem(INTRO_SHOWN_KEY, 'true');
      return true;
    }
  } catch (e) {
    console.error('[IntroFlow] Failed to check intro status:', e);
  }
  
  return false;
}

export function resetIntro(): void {
  try {
    localStorage.removeItem(INTRO_SHOWN_KEY);
  } catch {
    // Ignore storage errors
  }
}
