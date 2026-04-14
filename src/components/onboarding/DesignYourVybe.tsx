import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Palette, Sun, Moon, Monitor, Sparkles, ChevronRight } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';

const ACCENT_COLORS = [
  { name: 'Purple', hsl: '270, 70%, 55%', class: 'bg-purple-500' },
  { name: 'Blue', hsl: '210, 70%, 55%', class: 'bg-blue-500' },
  { name: 'Cyan', hsl: '190, 70%, 50%', class: 'bg-cyan-500' },
  { name: 'Green', hsl: '150, 65%, 45%', class: 'bg-green-500' },
  { name: 'Pink', hsl: '330, 70%, 55%', class: 'bg-pink-500' },
  { name: 'Orange', hsl: '25, 80%, 55%', class: 'bg-orange-500' },
  { name: 'Red', hsl: '0, 70%, 55%', class: 'bg-red-500' },
  { name: 'Yellow', hsl: '45, 80%, 50%', class: 'bg-yellow-500' },
];

const THEMES = [
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'system', label: 'Auto', icon: Monitor },
] as const;

interface DesignYourVybeProps {
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Quick 3-tap "Design Your VYBE" flow shown after onboarding.
 * Step 1: Pick accent color
 * Step 2: Pick theme mode  
 * Step 3: Confirm
 */
export const DesignYourVybe = memo(function DesignYourVybe({ onComplete, onSkip }: DesignYourVybeProps) {
  const [step, setStep] = useState(1);
  const [selectedColor, setSelectedColor] = useState(0); // Purple default
  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light' | 'system'>('dark');

  const handleApply = () => {
    // Apply the accent color to CSS
    const color = ACCENT_COLORS[selectedColor];
    document.documentElement.style.setProperty('--primary', color.hsl);
    
    // Apply theme
    if (selectedTheme === 'system') {
      document.documentElement.classList.remove('dark', 'light');
    } else {
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(selectedTheme);
    }

    // Persist to localStorage
    try {
      localStorage.setItem('vybe_accent_color', color.hsl);
      localStorage.setItem('vybe_theme_mode', selectedTheme);
    } catch {}

    onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-screen bg-background flex flex-col items-center justify-center px-6"
    >
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-20 blur-[80px]"
          style={{ backgroundColor: `hsl(${ACCENT_COLORS[selectedColor].hsl})` }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mb-4">
              {step === 1 ? <Palette className="h-6 w-6 text-primary" /> : <Sparkles className="h-6 w-6 text-primary" />}
            </div>
            <h2 className="text-xl font-bold mb-1">
              {step === 1 ? 'Pick your color' : step === 2 ? 'Choose your vibe' : 'Looking good! ✨'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {step === 1 ? 'This color will be your signature across VYBE' : step === 2 ? 'How do you like your screen?' : 'Your VYBE is ready'}
            </p>
          </motion.div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="colors"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-4 gap-3 mb-8"
            >
              {ACCENT_COLORS.map((color, i) => (
                <motion.button
                  key={color.name}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedColor(i)}
                  className={cn(
                    "aspect-square rounded-2xl flex items-center justify-center transition-all border-2",
                    selectedColor === i ? "border-foreground scale-110 shadow-lg" : "border-transparent"
                  )}
                  style={{ backgroundColor: `hsl(${color.hsl})` }}
                >
                  {selectedColor === i && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-3 h-3 rounded-full bg-white shadow-sm"
                    />
                  )}
                </motion.button>
              ))}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="themes"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex gap-3 mb-8"
            >
              {THEMES.map(theme => (
                <motion.button
                  key={theme.key}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedTheme(theme.key as any)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                    selectedTheme === theme.key
                      ? "border-primary bg-primary/10"
                      : "border-border/30 bg-muted/20"
                  )}
                >
                  <theme.icon className={cn(
                    "h-6 w-6",
                    selectedTheme === theme.key ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-xs font-semibold",
                    selectedTheme === theme.key ? "text-primary" : "text-muted-foreground"
                  )}>
                    {theme.label}
                  </span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2].map(s => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                s === step ? "w-8 bg-primary" : s < step ? "w-4 bg-primary/50" : "w-4 bg-muted"
              )}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onSkip} className="flex-1 rounded-full h-11">
            Skip
          </Button>
          <Button
            onClick={() => {
              if (step < 2) setStep(step + 1);
              else handleApply();
            }}
            className="flex-1 rounded-full h-11 gap-1.5"
          >
            {step < 2 ? (
              <>Next <ChevronRight className="h-4 w-4" /></>
            ) : (
              <>Apply <VybeMiniIcon size={16} showSparkles /></>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
});
