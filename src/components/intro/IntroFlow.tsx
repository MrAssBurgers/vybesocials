import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Users, MessageCircle, Camera, MapPin, Sparkles, ShoppingBag, CalendarDays, Video, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { db } from '@/lib/firebase';

const INTRO_SHOWN_KEY = 'vybe_intro_completed';

const SPLASH_CHECK_INTERVAL = 40;
const MAX_WAIT_TIME = 2000;
const MIN_WAIT_TIME = 150;

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface IntroFlowProps {
  onComplete: () => void;
  onSkip: () => void;
}

const slides = [
  {
    id: 'welcome',
    title: '', // VYBE wordmark used instead
    subtitle: 'Your social home for real connection.',
    icon: null,
  },
  {
    id: 'features',
    title: 'Everything you need',
    bullets: [
      { icon: Camera, text: 'Stories & Clips — share your moments' },
      { icon: MessageCircle, text: 'Messaging & Calls — DMs, voice & video' },
      { icon: Users, text: 'Communities — find your people' },
      { icon: MapPin, text: 'Friend Map — see who’s nearby' },
    ],
  },
  {
    id: 'vybe-agent',
    title: 'Meet VYBE Agent',
    subtitle: 'Your personal AI inside VYBE — chats, plans, creates, and vybes with you.',
    icon: Bot,
  },
  {
    id: 'coming-soon',
    title: 'And more, coming soon',
    subtitle: 'We’re just getting started.',
    bullets: [
      { icon: ShoppingBag, text: 'Marketplace' },
      { icon: CalendarDays, text: 'Events & Meetups' },
      { icon: Video, text: 'Video Messages' },
      { icon: Sparkles, text: 'AI Chatbot & creative tools' },
    ],
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

  const variants = useMemo(() => reduceMotion ? {} : {
    initial: { opacity: 0, y: 24, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -16, scale: 0.98 },
  }, [reduceMotion]);
  
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
      transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
      className="fixed inset-0 z-[200] bg-background flex flex-col overflow-hidden"
    >
      {/* GPU-optimized ambient glow — opacity-only keyframes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/3 -left-1/3 w-[140%] h-[140%] rounded-full" style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.35) 0%, transparent 65%)', filter: 'blur(80px)', animation: reduceMotion ? 'none' : 'intro-glow-a 8s ease-in-out infinite alternate' }} />
        <div className="absolute -bottom-1/3 -right-1/3 w-[130%] h-[130%] rounded-full" style={{ background: 'radial-gradient(circle, hsl(var(--accent) / 0.3) 0%, transparent 65%)', filter: 'blur(80px)', animation: reduceMotion ? 'none' : 'intro-glow-b 10s ease-in-out infinite alternate' }} />
        <style>{`@keyframes intro-glow-a{0%{opacity:.18}100%{opacity:.28}}@keyframes intro-glow-b{0%{opacity:.12}100%{opacity:.22}}`}</style>
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
            transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
            className="w-full max-w-md text-center space-y-8"
          >
            {/* Icon or Logo */}
            {slide.id === 'welcome' ? (
              <motion.div
                className="flex justify-center"
                initial={reduceMotion ? {} : { scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.55, ease: EASE_OUT_EXPO }}
              >
                <div className="relative">
                  <div
                    className="absolute inset-0 -m-8 rounded-full pointer-events-none"
                    style={{
                      background: 'radial-gradient(ellipse, hsl(var(--primary) / 0.45) 0%, hsl(var(--accent) / 0.2) 45%, transparent 75%)',
                      filter: 'blur(28px)',
                    }}
                  />
                  <span className="sr-only">VYBE</span>
                  <span
                    aria-hidden="true"
                    className="relative font-display font-black tracking-tight text-7xl sm:text-8xl block"
                    style={{
                      background: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--neon-purple, var(--primary))) 16.666%, hsl(var(--accent)) 33.333%, hsl(var(--primary)) 50%, hsl(var(--neon-purple, var(--primary))) 66.666%, hsl(var(--accent)) 83.333%, hsl(var(--primary)) 100%)',
                      backgroundSize: '200% 100%',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      animation: reduceMotion ? 'none' : 'gradient-shift 3.2s linear infinite',
                    }}
                  >
                    VYBE
                  </span>
                </div>
              </motion.div>
            ) : slide.id === 'vybe-agent' ? (
              <motion.div
                initial={reduceMotion ? {} : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.5, ease: EASE_OUT_EXPO }}
                className="flex flex-col items-center gap-4"
              >
                <div className="relative">
                  <div
                    className="absolute inset-0 -m-6 rounded-full pointer-events-none"
                    style={{
                      background: 'radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, hsl(var(--accent) / 0.25) 50%, transparent 75%)',
                      filter: 'blur(24px)',
                    }}
                  />
                  <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-2xl shadow-primary/40">
                    <Bot className="w-12 h-12 text-white" strokeWidth={2.2} />
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
                  <Sparkles className="w-3 h-3" />
                  Coming Soon
                </span>
              </motion.div>
            ) : slide.id === 'coming-soon' ? (
              <motion.div
                initial={reduceMotion ? {} : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.5, ease: EASE_OUT_EXPO }}
                className="flex justify-center"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 via-accent/20 to-primary/30 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Sparkles className="w-10 h-10 text-primary" />
                </div>
              </motion.div>
            ) : null}

            {/* Title */}
            {slide.title && (
              <h1 className="text-3xl sm:text-4xl font-display font-bold">
                {slide.title}
              </h1>
            )}

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
                    initial={reduceMotion ? {} : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + index * 0.08, duration: 0.4, ease: EASE_OUT_EXPO }}
                    className="flex items-center gap-4 p-3.5 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/40"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                      <bullet.icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-foreground">{bullet.text}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Bottom navigation */}
      <div className="relative z-10 p-6 pb-8 safe-area-bottom space-y-5">
        {/* Progress indicators - flat pill style matching desktop */}
        <div className="flex justify-center items-center gap-2">
          {slides.map((_, index) => (
            <motion.div
              key={index}
              onClick={() => setCurrentSlide(index)}
              role="button"
              tabIndex={0}
              className="cursor-pointer rounded-full"
              animate={{ width: index === currentSlide ? 40 : 16, opacity: index === currentSlide ? 1 : 0.35 }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
              style={{ height: 3, flexShrink: 0, background: index === currentSlide ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)' }}
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
    </motion.div>
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
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    
    await db
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
    const { data: profile } = await db
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
