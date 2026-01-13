import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

interface Viewer {
  user_id: string;
  viewed_at: string;
  profile?: {
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

interface SnapReadReceiptProps {
  status: 'sending' | 'sent' | 'delivered' | 'read';
  views?: Viewer[];
  isGroupChat?: boolean;
  maxDisplay?: number;
  className?: string;
}

// Individual read receipt avatar with animation
const ReadAvatar = memo(function ReadAvatar({
  viewer,
  index,
}: {
  viewer: Viewer;
  index: number;
}) {
  const signedUrl = useSignedUrl(viewer.profile?.avatar_url);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, x: -4 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      transition={{ 
        type: 'spring', 
        stiffness: 500, 
        damping: 30,
        delay: index * 0.05 
      }}
      className="relative"
    >
      <Avatar className="h-3 w-3 ring-[1px] ring-background">
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-[5px] bg-primary/20 text-primary">
          {viewer.profile?.username?.charAt(0).toUpperCase() || '✓'}
        </AvatarFallback>
      </Avatar>
    </motion.div>
  );
});

export const SnapReadReceipt = memo(function SnapReadReceipt({
  status,
  views = [],
  isGroupChat = false,
  maxDisplay = 2,
  className,
}: SnapReadReceiptProps) {
  const displayViewers = views.slice(0, maxDisplay);
  const remainingCount = views.length - maxDisplay;

  // Status icons with Snapchat-style appearance
  const statusIcon = useMemo(() => {
    switch (status) {
      case 'sending':
        return (
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            <Check className="h-2.5 w-2.5 text-muted-foreground/40" />
          </motion.div>
        );
      case 'sent':
        return <Check className="h-2.5 w-2.5 text-muted-foreground/50" />;
      case 'delivered':
        return (
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <CheckCheck className="h-3 w-3 text-muted-foreground/60" />
          </motion.div>
        );
      case 'read':
        // For read status with no profile data, show filled check
        if (views.length === 0 || !views.some(v => v.profile)) {
          return (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              <CheckCheck className="h-3 w-3 text-primary/70" />
            </motion.div>
          );
        }
        return null;
    }
  }, [status, views]);

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <AnimatePresence mode="wait">
        {status === 'read' && views.length > 0 && views.some(v => v.profile) ? (
          <motion.div
            key="avatars"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center -space-x-0.5"
          >
            {displayViewers.filter(v => v.profile).map((viewer, index) => (
              <ReadAvatar
                key={viewer.user_id}
                viewer={viewer}
                index={index}
              />
            ))}
            {remainingCount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: displayViewers.length * 0.05 }}
                className="h-3 w-3 rounded-full bg-muted/80 flex items-center justify-center text-[6px] font-medium text-muted-foreground ring-[1px] ring-background"
              >
                +{remainingCount}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="icon"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {statusIcon}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default SnapReadReceipt;
