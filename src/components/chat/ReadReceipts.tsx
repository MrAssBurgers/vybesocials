import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Eye } from 'lucide-react';

interface Viewer {
  id?: string;
  user_id: string;
  viewed_at: string;
  profile?: {
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

const avatarVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: {
      delay: i * 0.05,
      type: 'spring' as const,
      stiffness: 500,
      damping: 25,
    },
  }),
};

export function ReadReceipts({
  views,
  isGroupChat,
  maxDisplay = 5,
}: {
  views: Viewer[];
  isGroupChat?: boolean;
  maxDisplay?: number;
}) {
  if (!views || views.length === 0) return null;

  const displayedViewers = views.slice(0, maxDisplay);
  const remainingCount = views.length - maxDisplay;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 mt-1 justify-end"
          >
            <motion.div 
              className="flex items-center gap-1"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                }}
                transition={{ 
                  duration: 0.6,
                  ease: 'easeInOut',
                }}
              >
                <Eye className="h-3.5 w-3.5 text-primary" />
              </motion.div>
              <motion.span 
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] font-medium text-primary"
              >
                {views.length}
              </motion.span>
            </motion.div>
            
            <div className="flex -space-x-1.5">
              {displayedViewers.map((view, i) => (
                <motion.div
                  key={view.id || view.user_id}
                  custom={i}
                  variants={avatarVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ scale: 1.3, zIndex: 10, y: -2 }}
                  className="relative"
                >
                  <Avatar className="h-4 w-4 ring-2 ring-background cursor-pointer shadow-sm">
                    <AvatarImage src={view.profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                      {view.profile?.username?.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
              ))}
              
              {remainingCount > 0 && (
                <motion.div
                  custom={maxDisplay}
                  variants={avatarVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ scale: 1.2 }}
                  className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/20 text-[8px] font-medium text-primary ring-2 ring-background"
                >
                  +{remainingCount}
                </motion.div>
              )}
            </div>
            
            {isGroupChat && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-[10px] text-muted-foreground"
              >
                seen
              </motion.span>
            )}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-1"
          >
            <p className="text-xs font-medium">Seen by</p>
            {views.map((view) => (
              <div key={view.id || view.user_id} className="flex items-center gap-2 text-xs">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={view.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-[8px]">
                    {view.profile?.username?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span>{view.profile?.display_name || view.profile?.username}</span>
              </div>
            ))}
          </motion.div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
