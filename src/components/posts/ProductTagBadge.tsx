import { ShoppingBag, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ProductTagProps {
  tags: string[];
  className?: string;
}

/**
 * Detects product/shop-related tags and shows a shoppable indicator.
 * Tapping reveals the product tags with a smooth reveal animation.
 */
const SHOP_KEYWORDS = ['shop', 'buy', 'sale', 'product', 'merch', 'store', 'price', 'deal', 'discount', 'order'];

export function ProductTagBadge({ tags, className }: ProductTagProps) {
  const [expanded, setExpanded] = useState(false);
  
  const shopTags = tags.filter(tag => 
    SHOP_KEYWORDS.some(kw => tag.toLowerCase().includes(kw))
  );

  if (shopTags.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-xs font-semibold shadow-lg shadow-emerald-500/30 backdrop-blur-sm"
      >
        <ShoppingBag className="h-3 w-3" />
        <span>Shop</span>
        {shopTags.length > 1 && (
          <span className="bg-white/20 rounded-full px-1.5 text-[10px]">{shopTags.length}</span>
        )}
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="absolute top-full mt-1.5 left-0 z-50 min-w-[140px] p-2 rounded-xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-xl space-y-1"
          >
            {shopTags.map((tag) => (
              <button
                key={tag}
                className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-primary/10 transition-colors"
              >
                <ShoppingBag className="h-3 w-3 text-emerald-500" />
                <span>#{tag}</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto text-muted-foreground" />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
