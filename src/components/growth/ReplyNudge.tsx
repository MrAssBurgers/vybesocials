import { memo } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReplyNudgeProps {
  authorUsername: string;
  onReply?: () => void;
  className?: string;
}

export const ReplyNudge = memo(function ReplyNudge({ 
  authorUsername, 
  onReply,
  className 
}: ReplyNudgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5 }}
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-secondary/30',
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MessageCircle className="h-4 w-4" />
        <span>What do you think?</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-xs h-7 px-2 text-primary hover:text-primary"
        onClick={onReply}
      >
        Reply
        <ArrowRight className="h-3 w-3 ml-1" />
      </Button>
    </motion.div>
  );
});

export default ReplyNudge;
