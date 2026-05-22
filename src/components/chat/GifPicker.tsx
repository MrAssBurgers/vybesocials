import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, TrendingUp, Clock, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useGifFavorites, SavedGif } from '@/hooks/useGifFavorites';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// GIPHY calls go through the giphy-search edge function so the API key
// stays server-side. No client-bundled credentials.

interface GiphyGif {
  id: string;
  title: string;
  url: string;        // original/full quality
  previewUrl: string; // small preview
  mediumUrl: string;  // fixed-height
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

type TabType = 'trending' | 'recent' | 'favorites' | 'search';

export const GifPicker = memo(function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [nextOffset, setNextOffset] = useState<number>(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('trending');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const debouncedQuery = useDebouncedValue(searchQuery, 400);
  const { favorites, recent, addRecent, toggleFavorite, isFavorite } = useGifFavorites();

  // Fetch trending or search results
  const fetchGifs = useCallback(async (query: string, offset = 0) => {
    try {
      const trimmed = query.trim();
      const { data, error } = await supabase.functions.invoke('giphy-search', {
        body: {
          endpoint: trimmed ? 'search' : 'trending',
          query: trimmed || undefined,
          offset,
          limit: 30,
        },
      });
      if (error) throw error;
      return {
        gifs: (data?.results || []) as GiphyGif[],
        next: Number(data?.next || 0),
      };
    } catch (error) {
      console.error('Failed to fetch GIFs:', error);
      return { gifs: [], next: 0 };
    }
  }, []);

  // Switch to search mode when typing
  useEffect(() => {
    if (debouncedQuery.trim()) {
      setActiveTab('search');
    }
  }, [debouncedQuery]);

  // Initial load and search
  useEffect(() => {
    if (activeTab === 'recent' || activeTab === 'favorites') return;
    
    const loadGifs = async () => {
      setIsLoading(true);
      const query = activeTab === 'search' ? debouncedQuery : '';
      const { gifs: newGifs, next } = await fetchGifs(query, 0);
      setGifs(newGifs);
      setNextOffset(next);
      setIsLoading(false);
    };
    
    loadGifs();
  }, [debouncedQuery, fetchGifs, activeTab]);

  // Load more on scroll
  const handleLoadMore = useCallback(async () => {
    if (!nextOffset || isLoadingMore || activeTab === 'recent' || activeTab === 'favorites') return;
    
    setIsLoadingMore(true);
    const query = activeTab === 'search' ? debouncedQuery : '';
    const { gifs: moreGifs, next } = await fetchGifs(query, nextOffset);
    setGifs(prev => [...prev, ...moreGifs]);
    setNextOffset(next);
    setIsLoadingMore(false);
  }, [nextOffset, isLoadingMore, debouncedQuery, fetchGifs, activeTab]);

  // Infinite scroll detection
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const nearBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    
    if (nearBottom && !isLoadingMore && nextOffset) {
      handleLoadMore();
    }
  }, [handleLoadMore, isLoadingMore, nextOffset]);

  const handleSelect = useCallback((gif: GiphyGif | SavedGif) => {
    let gifUrl: string;
    let previewUrl: string;

    if ('mediumUrl' in gif) {
      gifUrl = gif.url || gif.mediumUrl || gif.previewUrl;
      previewUrl = gif.previewUrl || gifUrl;
    } else {
      gifUrl = gif.url;
      previewUrl = gif.previewUrl;
    }

    if (gifUrl) {
      addRecent({
        id: gif.id,
        url: gifUrl,
        previewUrl,
        title: gif.title,
      });
      onSelect(gifUrl);
    }
  }, [onSelect, addRecent]);

  const handleToggleFavorite = useCallback((gif: GiphyGif, e: React.MouseEvent) => {
    e.stopPropagation();
    const gifUrl = gif.url || gif.mediumUrl || gif.previewUrl;
    const previewUrl = gif.previewUrl || gifUrl;

    toggleFavorite({
      id: gif.id,
      url: gifUrl,
      previewUrl,
      title: gif.title,
    });
  }, [toggleFavorite]);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    if (tab !== 'search') {
      setSearchQuery('');
    }
  }, []);

  // Category buttons for quick search
  const categories = [
    { key: 'reactions', label: 'Reactions', query: 'reactions' },
    { key: 'happy', label: '😊', query: 'happy' },
    { key: 'love', label: '❤️', query: 'love' },
    { key: 'funny', label: '😂', query: 'funny' },
    { key: 'sad', label: '😢', query: 'sad' },
    { key: 'yes', label: '👍', query: 'yes agree' },
  ];

  const handleCategoryClick = useCallback((query: string) => {
    setSearchQuery(query);
    setActiveTab('search');
  }, []);

  // Render grid items
  const renderGifGrid = () => {
    if (activeTab === 'recent') {
      if (recent.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No recent GIFs</p>
            <p className="text-xs mt-1">GIFs you send will appear here</p>
          </div>
        );
      }
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2">
          {recent.map((gif) => (
            <GifGridItem
              key={gif.id}
              id={gif.id}
              imageUrl={gif.previewUrl}
              title={gif.title}
              isFavorited={isFavorite(gif.id)}
              onSelect={() => handleSelect(gif)}
              onToggleFavorite={(e) => {
                e.stopPropagation();
                toggleFavorite(gif);
              }}
            />
          ))}
        </div>
      );
    }

    if (activeTab === 'favorites') {
      if (favorites.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Star className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No favorite GIFs</p>
            <p className="text-xs mt-1">Tap the star to save GIFs</p>
          </div>
        );
      }
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2">
          {favorites.map((gif) => (
            <GifGridItem
              key={gif.id}
              id={gif.id}
              imageUrl={gif.previewUrl}
              title={gif.title}
              isFavorited={true}
              onSelect={() => handleSelect(gif)}
              onToggleFavorite={(e) => {
                e.stopPropagation();
                toggleFavorite(gif);
              }}
            />
          ))}
        </div>
      );
    }

    // Trending or Search results
    return (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2">
          {gifs.map((gif) => (
            <GifGridItem
              key={gif.id}
              id={gif.id}
              imageUrl={gif.previewUrl || gif.mediumUrl}
              title={gif.title}
              isFavorited={isFavorite(gif.id)}
              onSelect={() => handleSelect(gif)}
              onToggleFavorite={(e) => handleToggleFavorite(gif, e)}
            />
          ))}
        </div>
        
        {isLoadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        
        {gifs.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <span className="text-2xl mb-2">🔍</span>
            <p className="text-sm">No GIFs found</p>
          </div>
        )}
      </>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="bg-background border border-border rounded-xl shadow-lg overflow-hidden w-full max-w-sm sm:max-w-md"
    >
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="font-semibold text-sm flex items-center gap-2">
          <span className="text-lg">🎬</span>
          GIFs
          <span className="text-xs text-muted-foreground font-normal">powered by GIPHY</span>
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
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
            className="pl-9 h-10"
          />
        </div>
      </div>

      {/* Tabs: Trending, Recent, Favorites */}
      <div className="px-2 pb-2 flex gap-1.5 border-b border-border">
        <Button
          variant={activeTab === 'trending' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('trending')}
          className="h-8 px-3 text-xs flex-shrink-0"
        >
          <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
          Trending
        </Button>
        <Button
          variant={activeTab === 'recent' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('recent')}
          className="h-8 px-3 text-xs flex-shrink-0"
        >
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          Recent
          {recent.length > 0 && (
            <span className="ml-1 text-[10px] opacity-70">({recent.length})</span>
          )}
        </Button>
        <Button
          variant={activeTab === 'favorites' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('favorites')}
          className="h-8 px-3 text-xs flex-shrink-0"
        >
          <Star className="h-3.5 w-3.5 mr-1.5" />
          Favorites
          {favorites.length > 0 && (
            <span className="ml-1 text-[10px] opacity-70">({favorites.length})</span>
          )}
        </Button>
      </div>

      {/* Categories (only show for trending/search) */}
      {(activeTab === 'trending' || activeTab === 'search') && (
        <div className="px-2 py-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {categories.map(({ key, label, query }) => (
            <Button
              key={key}
              variant={searchQuery === query ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleCategoryClick(query)}
              className="h-7 px-2.5 text-xs flex-shrink-0 whitespace-nowrap"
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {/* GIF Grid */}
      <ScrollArea className="h-64 sm:h-80" onScrollCapture={handleScroll}>
        <div ref={scrollRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            renderGifGrid()
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
});

// Separate component for grid items with favorite button
interface GifGridItemProps {
  id: string;
  imageUrl: string;
  title?: string;
  isFavorited: boolean;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}

const GifGridItem = memo(function GifGridItem({
  id,
  imageUrl,
  title,
  isFavorited,
  onSelect,
  onToggleFavorite,
}: GifGridItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onSelect}
        className="w-full h-full hover:ring-2 hover:ring-primary transition-all"
      >
        <img
          src={imageUrl}
          alt={title || 'GIF'}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </motion.button>
      
      {/* Favorite button overlay */}
      <AnimatePresence>
        {(isHovered || isFavorited) && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={onToggleFavorite}
            className={cn(
              "absolute top-1 right-1 p-1.5 rounded-full backdrop-blur-sm transition-colors",
              isFavorited 
                ? "bg-accent text-accent-foreground" 
                : "bg-background/50 text-foreground hover:bg-background/70"
            )}
          >
            <Star 
              className={cn("h-3.5 w-3.5", isFavorited && "fill-current")} 
            />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
