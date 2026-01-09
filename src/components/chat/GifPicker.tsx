import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

// Built-in GIF library - categorized popular reaction GIFs
const BUILTIN_GIFS = {
  trending: [
    'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif', // thumbs up
    'https://media.giphy.com/media/l3V0FBxSzWp6O0Lf2/giphy.gif', // applause
    'https://media.giphy.com/media/26gsjCZpPolPr3sBy/giphy.gif', // party
    'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', // love
    'https://media.giphy.com/media/3oz8xLd9DJq2l2VFtu/giphy.gif', // laughing
    'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif', // cat
    'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif', // happy
    'https://media.giphy.com/media/l4pTsh45Dg7jnDM6Q/giphy.gif', // celebrate
  ],
  reactions: [
    'https://media.giphy.com/media/3oEjHI8WJv4x6UPDB6/giphy.gif', // wow
    'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif', // omg
    'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', // shocked
    'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif', // sad
    'https://media.giphy.com/media/26ufnwz3wDUli7GU0/giphy.gif', // angry
    'https://media.giphy.com/media/3oz8xZvvOZRmKay4xy/giphy.gif', // thinking
  ],
  love: [
    'https://media.giphy.com/media/l4pTdcifPZLpDjL1e/giphy.gif', // heart
    'https://media.giphy.com/media/26FLdmIp6wJr91JAI/giphy.gif', // love you
    'https://media.giphy.com/media/3oz8xIsloV7zOmt81G/giphy.gif', // kiss
    'https://media.giphy.com/media/l0MYAs5E2oIDCq9So/giphy.gif', // hug
  ],
  funny: [
    'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif', // lol
    'https://media.giphy.com/media/3o6Zt4HU9uwXmXSAuI/giphy.gif', // rofl
    'https://media.giphy.com/media/l46Cy1rHbQ92uuLXa/giphy.gif', // haha
    'https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif', // dead
  ],
};

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export const GifPicker = memo(function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gifs, setGifs] = useState<string[]>(BUILTIN_GIFS.trending);
  const [activeCategory, setActiveCategory] = useState<'trending' | 'reactions' | 'love' | 'funny'>('trending');
  
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  // Filter built-in GIFs based on search - in future, integrate with GIPHY/Tenor API
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setGifs(BUILTIN_GIFS[activeCategory]);
      return;
    }
    
    setIsLoading(true);
    // Simulate search delay
    setTimeout(() => {
      // For now, show all GIFs when searching
      const allGifs = Object.values(BUILTIN_GIFS).flat();
      setGifs(allGifs);
      setIsLoading(false);
    }, 200);
  }, [debouncedQuery, activeCategory]);

  const handleCategoryChange = useCallback((category: typeof activeCategory) => {
    setActiveCategory(category);
    setSearchQuery('');
    setGifs(BUILTIN_GIFS[category]);
  }, []);

  const handleSelect = useCallback((gifUrl: string) => {
    onSelect(gifUrl);
  }, [onSelect]);

  const categories = [
    { key: 'trending' as const, label: 'Trending', icon: TrendingUp },
    { key: 'reactions' as const, label: 'Reactions' },
    { key: 'love' as const, label: '❤️' },
    { key: 'funny' as const, label: '😂' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="bg-background border border-border rounded-xl shadow-lg overflow-hidden w-80"
    >
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="font-semibold text-sm">GIFs</span>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search GIFs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-2 pb-2 flex gap-1 overflow-x-auto">
        {categories.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={activeCategory === key ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange(key)}
            className="h-7 px-2 text-xs flex-shrink-0"
          >
            {Icon && <Icon className="h-3 w-3 mr-1" />}
            {label}
          </Button>
        ))}
      </div>

      {/* GIF Grid */}
      <ScrollArea className="h-64">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 p-2">
            {gifs.map((gif, index) => (
              <motion.button
                key={`${gif}-${index}`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(gif)}
                className="aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all"
              >
                <img
                  src={gif}
                  alt="GIF"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </motion.button>
            ))}
          </div>
        )}
        {gifs.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p className="text-sm">No GIFs found</p>
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
});
