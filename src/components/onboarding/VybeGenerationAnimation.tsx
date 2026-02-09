import { memo, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { cn } from '@/lib/utils';
import { Check, Sparkles, Palette, Type, Zap, Stars, Heart, Sliders, Wand } from 'lucide-react';

interface VybeGenerationAnimationProps {
  isGenerating: boolean;
  buildPhase: number;
  phases: Array<{ label: string; icon: React.ElementType; duration: number }>;
}

// Static noise canvas for the generation effect
function StaticNoiseCanvas({ progress, isActive }: { progress: number; isActive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Create image data for noise
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    let frameCount = 0;
    
    const animate = () => {
      frameCount++;
      
      // Generate noise with decreasing intensity as progress increases
      const noiseIntensity = Math.max(0, 1 - (progress / 100) * 1.2);
      const colorBleed = progress / 100;
      
      for (let i = 0; i < data.length; i += 4) {
        const noise = Math.random();
        
        // As progress increases, blend from static to theme colors
        if (noise < noiseIntensity * 0.7) {
          // Static noise pixels
          const brightness = Math.floor(Math.random() * 100);
          data[i] = brightness;     // R
          data[i + 1] = brightness; // G
          data[i + 2] = brightness; // B
          data[i + 3] = Math.floor(200 * noiseIntensity); // A
        } else if (noise < noiseIntensity) {
          // Colored static pixels (primary/accent colors coming through)
          const colorChoice = Math.random();
          if (colorChoice < 0.5) {
            // Primary color tint
            data[i] = 220;     // R (pink)
            data[i + 1] = 50;  // G
            data[i + 2] = 150; // B
          } else {
            // Accent color tint
            data[i] = 50;      // R
            data[i + 1] = 200; // G (cyan)
            data[i + 2] = 220; // B
          }
          data[i + 3] = Math.floor(150 * noiseIntensity);
        } else {
          // Transparent - let the background through
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // Slower frame rate for performance
      if (isActive && noiseIntensity > 0.05) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    // Start animation
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [progress, isActive]);
  
  if (!isActive) return null;
  
  return (
    <motion.canvas
      ref={canvasRef}
      width={200}
      height={200}
      initial={{ opacity: 1 }}
      animate={{ opacity: Math.max(0, 1 - (progress / 100) * 1.5) }}
      className="absolute inset-0 w-full h-full rounded-full mix-blend-overlay pointer-events-none"
    />
  );
}

export const VybeGenerationAnimation = memo(function VybeGenerationAnimation({
  isGenerating,
  buildPhase,
  phases,
}: VybeGenerationAnimationProps) {
  const [progress, setProgress] = useState(0);
  
  // Calculate progress based on build phase
  useEffect(() => {
    if (!isGenerating) {
      setProgress(0);
      return;
    }
    
    const targetProgress = ((buildPhase + 1) / phases.length) * 100;
    
    // Animate to target
    const interval = setInterval(() => {
      setProgress(prev => {
        const diff = targetProgress - prev;
        if (Math.abs(diff) < 1) return targetProgress;
        return prev + diff * 0.1;
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [isGenerating, buildPhase, phases.length]);
  
  return (
    <motion.div
      key="building"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      className="relative z-10 h-full flex flex-col items-center justify-center p-6"
    >
      {/* Central orb with static effect */}
      <div className="relative mb-12">
        {/* Outer glow ring */}
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 -m-4 rounded-full bg-gradient-to-r from-primary/30 via-accent/30 to-primary/30 blur-xl"
        />
        
        {/* Main orb container */}
        <motion.div
          animate={{ 
            rotate: [0, 360],
          }}
          transition={{ 
            rotate: { duration: 20, repeat: Infinity, ease: "linear" },
          }}
          className="w-40 h-40 rounded-full bg-gradient-conic from-primary via-accent to-primary p-1 relative"
        >
          {/* Inner content */}
          <div className="w-full h-full rounded-full bg-background flex items-center justify-center relative overflow-hidden">
            {/* Static noise overlay */}
            <StaticNoiseCanvas progress={progress} isActive={isGenerating} />
            
            {/* VYBE icon that reveals as static clears */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: Math.min(1, progress / 50),
                scale: 0.8 + (progress / 100) * 0.2,
              }}
              className="relative z-10"
            >
              <VybeMiniIcon size={60} showSparkles />
            </motion.div>
          </div>
        </motion.div>
        
        {/* Orbiting particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ rotate: 360 }}
            transition={{ 
              duration: 4 + i * 0.5, 
              repeat: Infinity, 
              ease: "linear",
            }}
            className="absolute inset-0"
            style={{ transform: `rotate(${i * 60}deg)` }}
          >
            <motion.div
              animate={{ 
                scale: [0.5, 1, 0.5],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity, 
                delay: i * 0.2,
              }}
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
              style={{
                background: i % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))',
              }}
            />
          </motion.div>
        ))}
      </div>
      
      {/* Build phases */}
      <div className="space-y-3 w-full max-w-sm">
        {phases.map((phase, index) => {
          const Icon = phase.icon;
          const isActive = buildPhase === index;
          const isComplete = buildPhase > index;
          
          return (
            <motion.div
              key={phase.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ 
                opacity: isActive || isComplete ? 1 : 0.3,
                x: 0,
              }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-all duration-300",
                isActive && "bg-primary/10 border border-primary/30 scale-[1.02]",
                isComplete && "text-primary"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300",
                isActive && "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
                isComplete && "bg-primary/20 text-primary",
                !isActive && !isComplete && "bg-muted text-muted-foreground"
              )}>
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className={cn("h-4 w-4", isActive && "animate-pulse")} />
                )}
              </div>
              <span className={cn(
                "text-sm font-medium",
                isActive && "text-foreground font-semibold",
                isComplete && "text-foreground/80",
                !isActive && !isComplete && "text-foreground/40"
              )}>
                {phase.label}
              </span>
              {isActive && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="ml-auto"
                >
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
      
      {/* Progress indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 text-center"
      >
        <span className="text-2xl font-bold text-primary tabular-nums">
          {Math.round(progress)}%
        </span>
      </motion.div>
    </motion.div>
  );
});
