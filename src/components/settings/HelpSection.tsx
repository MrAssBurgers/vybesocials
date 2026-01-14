import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MessageSquareHeart, Sparkles, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HelpSection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
        <MessageSquareHeart className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        Help & Feedback
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Learn how to use VYBE or share your feedback.
      </p>
      <div className="space-y-2">
        <Button 
          variant="outline" 
          className="w-full justify-between"
          onClick={() => {
            const event = new CustomEvent('open-tutorial');
            window.dispatchEvent(event);
          }}
        >
          <span>View Tutorial</span>
          <Sparkles className="h-4 w-4" />
        </Button>
        <Link to="/feedback">
          <Button variant="outline" className="w-full justify-between">
            <span>Open Feedback Hub</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
