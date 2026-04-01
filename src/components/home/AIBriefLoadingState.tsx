import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, MessageCircle, Globe, ChevronDown, Zap } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';

// Generating screen with spinning V animation (indeterminate)
export const GeneratingScreen = memo(function GeneratingScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      {/* Centered spinning V with glow ring */}
      <div className="relative mb-8" data-allow-animation="true">
        <div
          className="absolute rounded-full glow-ring-pulse"
          style={{
            width: 100, height: 100,
            left: '50%', top: '50%',
            marginLeft: -50, marginTop: -50,
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
          }}
        />
        
        <div className="relative spin-smooth" style={{ width: 100, height: 100 }} data-allow-animation="true">
          <div className="absolute inset-0" style={{ width: 100, height: 100 }}>
            {[0, 60, 120, 180, 240, 300].map((angle, i) => {
              const radius = 42;
              const rad = (angle * Math.PI) / 180;
              const x = 50 + radius * Math.cos(rad);
              const y = 50 + radius * Math.sin(rad);
              const isAccent = i % 2 === 0;
              return (
                <div
                  key={i}
                  className="absolute rounded-full animate-pulse"
                  style={{
                    left: `${x}%`, top: `${y}%`,
                    width: i % 2 === 0 ? 4 : 3, height: i % 2 === 0 ? 4 : 3,
                    transform: 'translate(-50%, -50%)',
                    background: isAccent ? 'hsl(var(--accent))' : 'hsl(var(--primary))',
                    boxShadow: isAccent ? '0 0 6px 2px hsl(var(--accent) / 0.5)' : '0 0 6px 2px hsl(var(--primary) / 0.5)',
                    animationDelay: `${i * 0.15}s`, animationDuration: '1.5s',
                  }}
                />
              );
            })}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <VybeMiniIcon size={64} showSparkles={false} animated={false} />
          </div>
        </div>
      </div>

      {/* Text */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Crafting Your Brief
        </h3>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-sm text-muted-foreground"
        >
          Fetching live updates...
        </motion.p>
      </div>

      {/* Indeterminate loading bar */}
      <div className="w-48 mt-6 h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))' }}
          initial={{ x: '-100%', width: '40%' }}
          animate={{ x: '250%' }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
});

// Preview card data
const previewCards = [
  { id: 'summary', icon: Zap, title: 'Quick Summary', description: 'Your personalized daily overview', color: 'primary' },
  { id: 'trending', icon: TrendingUp, title: 'Trending Topics', description: "What's happening in your interests", color: 'accent' },
  { id: 'messages', icon: MessageCircle, title: 'Message Highlights', description: 'Important conversations to catch up on', color: 'primary' },
  { id: 'world', icon: Globe, title: 'World Updates', description: 'Latest news from your topics', color: 'accent' },
];

interface PreviewCardProps {
  icon: typeof Zap;
  title: string;
  description: string;
  color: string;
  index: number;
}

const colorClasses = {
  primary: { bg: 'bg-primary/10', text: 'text-primary' },
  accent: { bg: 'bg-accent/10', text: 'text-accent' },
} as const;

const PreviewCard = memo(function PreviewCard({ 
  icon: Icon, title, description, color, index 
}: PreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colorClass = colorClasses[color as keyof typeof colorClasses] || colorClasses.primary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      className="overflow-hidden"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-4 rounded-xl bg-card/60 border border-border/40 hover:border-border/60 transition-all duration-200 active:scale-[0.98]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${colorClass.bg}`}>
              <Icon className={`h-4 w-4 ${colorClass.text}`} />
            </div>
            <div>
              <h4 className="font-medium text-sm text-foreground">{title}</h4>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </motion.div>
        </div>
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 mt-1 rounded-xl bg-muted/30 border border-border/20">
              <div className="space-y-2">
                {[1, 0.85, 0.7].map((width, i) => (
                  <div
                    key={i}
                    className="h-3 rounded-md bg-muted/50 relative overflow-hidden"
                    style={{ width: `${width * 100}%` }}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/40 to-transparent"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-3 text-center">
                Loading content...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

import { useState } from 'react';

// Main loading state with preview cards
export const BriefLoadingState = memo(function BriefLoadingState({ 
  isGenerating = true 
}: { 
  isGenerating?: boolean 
}) {
  if (isGenerating) {
    return <GeneratingScreen />;
  }

  return (
    <div className="space-y-3 py-2">
      <motion.p
        className="text-xs text-muted-foreground text-center mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        Tap to preview sections
      </motion.p>
      {previewCards.map((card, index) => (
        <PreviewCard
          key={card.id}
          icon={card.icon}
          title={card.title}
          description={card.description}
          color={card.color}
          index={index}
        />
      ))}
    </div>
  );
});
