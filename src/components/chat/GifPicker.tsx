import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Loader2, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

// Tenor API v1 - free public key for basic usage
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';

interface TenorGif {
  id: string;
  title: string;
  media_formats: {
    tinygif?: { url: string };
    gif?: { url: string };
    mediumgif?: { url: string };
  };
}

interface TenorResponse {
  results: TenorGif[];
  next: string;
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export const GifPicker = memo(function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [nextPos, setNextPos] = useState<string>('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const debouncedQuery = useDebouncedValue(searchQuery, 400);

  // Fetch trending or search results
  const fetchGifs = useCallback(async (query: string, pos?: string) => {
    try {
      const endpoint = query.trim() 
        ? `${TENOR_BASE_URL}/search` 
        : `${TENOR_BASE_URL}/featured`;
      
      const params = new URLSearchParams({
        key: TENOR_API_KEY,
        client_key: 'vybe_chat',
        limit: '30',
        media_filter: 'tinygif,gif',
      });
      
      if (query.trim()) {
        params.set('q', query);
      }
      
      if (pos) {
        params.set('pos', pos);
      }

      const response = await fetch(`${endpoint}?${params.toString()}`);
      const data: TenorResponse = await response.json();
      
      return {
        gifs: data.results || [],
        next: data.next || '',
      };
    } catch (error) {
      console.error('Failed to fetch GIFs:', error);
      return { gifs: [], next: '' };
    }
  }, []);

  // Initial load and search
  useEffect(() => {
    const loadGifs = async () => {
      setIsLoading(true);
      const { gifs: newGifs, next } = await fetchGifs(debouncedQuery);
      setGifs(newGifs);
      setNextPos(next);
      setIsLoading(false);
    };
    
    loadGifs();
  }, [debouncedQuery, fetchGifs]);

  // Load more on scroll
  const handleLoadMore = useCallback(async () => {
    if (!nextPos || isLoadingMore) return;
    
    setIsLoadingMore(true);
    const { gifs: moreGifs, next } = await fetchGifs(debouncedQuery, nextPos);
    setGifs(prev => [...prev, ...moreGifs]);
    setNextPos(next);
    setIsLoadingMore(false);
  }, [nextPos, isLoadingMore, debouncedQuery, fetchGifs]);

  // Infinite scroll detection
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const nearBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    
    if (nearBottom && !isLoadingMore && nextPos) {
      handleLoadMore();
    }
  }, [handleLoadMore, isLoadingMore, nextPos]);

  const handleSelect = useCallback((gif: TenorGif) => {
    // Prefer tinygif for smaller file size, fallback to gif
    const gifUrl = gif.media_formats.tinygif?.url || gif.media_formats.gif?.url || '';
    if (gifUrl) {
      onSelect(gifUrl);
    }
  }, [onSelect]);

  const categories = [
    { key: 'trending', label: 'Trending', query: '' },
    { key: 'reactions', label: 'Reactions', query: 'reactions' },
    { key: 'happy', label: '😊', query: 'happy' },
    { key: 'love', label: '❤️', query: 'love' },
    { key: 'funny', label: '😂', query: 'funny' },
    { key: 'sad', label: '😢', query: 'sad' },
    { key: 'yes', label: '👍', query: 'yes agree' },
    { key: 'no', label: '👎', query: 'no nope' },
  ];

  const handleCategoryClick = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

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
          <span className="text-xs text-muted-foreground font-normal">powered by Tenor</span>
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

      {/* Categories */}
      <div className="px-2 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
        {categories.map(({ key, label, query }) => (
          <Button
            key={key}
            variant={searchQuery === query ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryClick(query)}
            className="h-8 px-3 text-xs flex-shrink-0 whitespace-nowrap"
          >
            {key === 'trending' && <TrendingUp className="h-3.5 w-3.5 mr-1.5" />}
            {label}
          </Button>
        ))}
      </div>

      {/* GIF Grid */}
      <ScrollArea className="h-64 sm:h-80" onScrollCapture={handleScroll}>
        <div ref={scrollRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2">
                {gifs.map((gif) => (
                  <motion.button
                    key={gif.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelect(gif)}
                    className="aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all"
                  >
                    <img
                      src={gif.media_formats.tinygif?.url || gif.media_formats.gif?.url}
                      alt={gif.title || 'GIF'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </motion.button>
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
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
});
