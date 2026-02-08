import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ExternalLink, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { useGlobalBannerEvents } from '@/hooks/useGlobalEvents';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { cn } from '@/lib/utils';

export const GlobalEventBanner = memo(function GlobalEventBanner() {
  const navigate = useNavigate();
  const { data: events, isLoading } = useGlobalBannerEvents();
  const { data: safetySettings } = useSafetySettings();

  // Respect user's opt-out preference
  if (safetySettings && !safetySettings.show_global_events) {
    return null;
  }

  if (isLoading || !events?.length) {
    return null;
  }

  const featuredEvent = events[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mx-4 mb-4"
      >
        <button
          onClick={() => navigate(`/events/${featuredEvent.id}`)}
          className={cn(
            "w-full relative overflow-hidden rounded-2xl",
            "liquid-glass-card border border-primary/20",
            "p-4 text-left transition-all duration-300",
            "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10",
            "active:scale-[0.98]"
          )}
        >
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 pointer-events-none" />
          
          {/* Sparkle effect */}
          <motion.div
            className="absolute top-2 right-2"
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </motion.div>

          <div className="relative flex items-center gap-4">
            {/* Cover image or icon */}
            {featuredEvent.cover_image ? (
              <div className="h-14 w-14 rounded-xl overflow-hidden flex-shrink-0">
                <img
                  src={featuredEvent.cover_image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Sponsored badge */}
              {featuredEvent.sponsor_id && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full mb-1">
                  Sponsored
                </span>
              )}
              
              <h3 className="font-semibold text-sm line-clamp-1 text-foreground">
                {featuredEvent.title}
              </h3>
              
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(featuredEvent.start_time), 'MMM d, h:mm a')}
              </p>
            </div>

            <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </div>

          {/* Event count indicator */}
          {events.length > 1 && (
            <div className="mt-3 flex items-center gap-1">
              {events.slice(0, 3).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 rounded-full transition-all",
                    i === 0 ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                  )}
                />
              ))}
              {events.length > 3 && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  +{events.length - 3} more
                </span>
              )}
            </div>
          )}
        </button>
      </motion.div>
    </AnimatePresence>
  );
});
