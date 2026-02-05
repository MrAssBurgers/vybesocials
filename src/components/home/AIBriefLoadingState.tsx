import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, MessageCircle, Globe, ChevronDown, Zap } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';

// Generating screen with spinning V animation + orbiting sparkles
export const GeneratingScreen = memo(function GeneratingScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      {/* Centered spinning V with glow ring + orbiting sparkles */}
      <motion.div
        className="relative mb-8"
        data-allow-animation="true"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Outer glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            width: 100,
            height: 100,
            left: '50%',
            top: '50%',
            marginLeft: -50,
            marginTop: -50,
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Orbiting sparkles - CSS-only for iOS performance */}
        <div 
          className="absolute"
          style={{
            width: 100,
            height: 100,
            left: '50%',
            top: '50%',
            marginLeft: -50,
            marginTop: -50,
          }}
          data-allow-animation="true"
        >
          <div className="orbit-sparkle" style={{ animationDelay: '0s' }} />
          <div className="orbit-sparkle" style={{ animationDelay: '-0.5s' }} />
          <div className="orbit-sparkle" style={{ animationDelay: '-1s' }} />
          <div className="orbit-sparkle" style={{ animationDelay: '-1.5s' }} />
          <div className="orbit-sparkle" style={{ animationDelay: '-2s' }} />
          <div className="orbit-sparkle" style={{ animationDelay: '-2.5s' }} />
        </div>
        
        {/* Spinning V container */}
        <motion.div
          className="relative flex items-center justify-center"
          style={{ width: 80, height: 80 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        >
          <VybeMiniIcon size={64} showSparkles animated />
        </motion.div>
      </motion.div>

      {/* Text */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Crafting Your Brief
        </h3>
        <p className="text-sm text-muted-foreground">
          Gathering updates just for you...
        </p>
      </motion.div>

      {/* Animated loading bar */}
      <motion.div 
        className="w-32 h-1 bg-muted/30 rounded-full mt-6 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-primary"
          style={{ width: '40%' }}
          animate={{ x: ['-100%', '250%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
});

// Preview card data
const previewCards = [
  {
    id: 'summary',
    icon: Zap,
    title: 'Quick Summary',
    description: 'Your personalized daily overview',
    color: 'primary',
  },
  {
    id: 'trending',
    icon: TrendingUp,
    title: 'Trending Topics',
    description: 'What\'s happening in your interests',
    color: 'accent',
  },
  {
    id: 'messages',
    icon: MessageCircle,
    title: 'Message Highlights',
    description: 'Important conversations to catch up on',
    color: 'primary',
  },
  {
    id: 'world',
    icon: Globe,
    title: 'World Updates',
    description: 'Latest news from your topics',
    color: 'accent',
  },
];

interface PreviewCardProps {
  icon: typeof Zap;
  title: string;
  description: string;
  color: string;
  index: number;
}

// Static color class mappings to ensure Tailwind includes these classes
const colorClasses = {
  primary: {
    bg: 'bg-primary/10',
    text: 'text-primary',
  },
  accent: {
    bg: 'bg-accent/10',
    text: 'text-accent',
  },
} as const;

const PreviewCard = memo(function PreviewCard({ 
  icon: Icon, 
  title, 
  description, 
  color,
  index 
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
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
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
                {/* Shimmer skeleton lines */}
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
