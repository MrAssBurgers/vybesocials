import { memo } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Heart, Users, TrendingUp, Music2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Sound } from '@/hooks/useSounds';

interface SoundCardProps {
  sound: Sound;
  onSelect: (soundId: string) => void;
  onUse: (soundId: string) => void;
  isSelected?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const SoundCard = memo(function SoundCard({
  sound,
  onSelect,
  onUse,
  isSelected = false,
  size = 'md'
}: SoundCardProps) {
  const cardSizes = {
    sm: 'aspect-square',
    md: 'aspect-[4/5]',
    lg: 'aspect-[3/4]'
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={cn("group cursor-pointer", isSelected && "ring-2 ring-primary")}
    >
      <Card 
        className="overflow-hidden hover:shadow-lg transition-all duration-300"
        onClick={() => onSelect(sound.sound_id)}
      >
        {/* Cover Art / Waveform */}
        <div className={cn("relative", cardSizes[size])}>
          {/* Background gradient if no cover */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-red-500/20" />
          
          {sound.cover_url ? (
            <img
              src={sound.cover_url}
              alt={sound.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-background/50 to-muted/50">
              <Music2 className="h-12 w-12 text-muted-foreground" />
            </div>
          )}

          {/* Play overlay */}
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <Button
              size="icon"
              variant="secondary"
              className="w-12 h-12 rounded-full bg-background/90 hover:bg-background"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(sound.sound_id);
              }}
            >
              <Play className="h-5 w-5 ml-0.5" />
            </Button>
          </div>

          {/* Trend indicator */}
          {sound.trend_score > 50 && (
            <div className="absolute top-2 right-2">
              <Badge variant="destructive" className="text-xs animate-pulse">
                <TrendingUp className="h-3 w-3 mr-1" />
                Hot
              </Badge>
            </div>
          )}

          {/* Duration */}
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {Math.floor(sound.duration / 60)}:{(sound.duration % 60).toFixed(0).padStart(2, '0')}
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-2">
          <div>
            <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
              {sound.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {sound.artist}
            </p>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>{sound.usage_count}</span>
            </div>
            <span>{formatDistanceToNow(new Date(sound.created_at))}</span>
          </div>

          {/* Tags */}
          {sound.tags && sound.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sound.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Action Button */}
          <Button
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              onUse(sound.sound_id);
            }}
          >
            Preview sound
          </Button>
        </div>
      </Card>
    </motion.div>
  );
});