import { memo } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, TrendingUp } from 'lucide-react';

interface AIBriefCardProps {
  interest: string;
  content: string;
  sources?: string[];
  imageUrl?: string;
}

export const AIBriefCard = memo(function AIBriefCard({ 
  interest, 
  content, 
  sources = [],
  imageUrl 
}: AIBriefCardProps) {
  const getInterestEmoji = (topic: string) => {
    const emojis: Record<string, string> = {
      politics: '🗳️',
      gaming: '🎮',
      cooking: '🍳',
      fitness: '💪',
      music: '🎵',
      sports: '⚽',
      movies: '🎬',
      technology: '💻',
      fashion: '👗',
      travel: '✈️',
      art: '🎨',
      photography: '📸',
      reading: '📚',
      science: '🔬',
      business: '📈',
      health: '🏥',
      nature: '🌿',
      comedy: '😂',
      animals: '🐾',
      diy: '🔧',
    };
    return emojis[interest.toLowerCase()] || '✨';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3 rounded-xl bg-background/60 border border-border/50 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{getInterestEmoji(interest)}</span>
        <span className="text-xs font-medium text-primary capitalize">{interest}</span>
        <TrendingUp className="h-3 w-3 text-accent ml-auto" />
      </div>

      {/* Image if available */}
      {imageUrl && (
        <div className="mb-2 rounded-lg overflow-hidden">
          <img 
            src={imageUrl} 
            alt={interest}
            className="w-full h-24 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Content */}
      <p className="text-sm text-foreground/90 leading-relaxed mb-2">
        {content}
      </p>

      {/* Source links */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sources.slice(0, 2).map((source, idx) => {
            try {
              const url = new URL(source);
              return (
                <a
                  key={idx}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate max-w-[100px]">{url.hostname.replace('www.', '')}</span>
                </a>
              );
            } catch {
              return null;
            }
          })}
        </div>
      )}
    </motion.div>
  );
});
