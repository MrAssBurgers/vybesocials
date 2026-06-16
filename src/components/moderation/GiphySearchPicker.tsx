import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';

interface GiphySearchPickerProps {
  selectedGifUrl: string | null;
  onSelectGif: (url: string | null) => void;
}

interface GiphyGif {
  id: string;
  title: string;
  url: string;        // original
  previewUrl: string; // small preview
  mediumUrl: string;  // fixed-height
}

// GIPHY calls go through the giphy-search edge function so the API key
// stays server-side. No client-bundled credentials.

export const GiphySearchPicker = ({ selectedGifUrl, onSelectGif }: GiphySearchPickerProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GiphyGif[]>([]);
  const [trending, setTrending] = useState<GiphyGif[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load trending on mount
  useEffect(() => {
    const loadTrending = async () => {
      try {
        const { data } = await db.functions.invoke('giphy-search', {
          body: { endpoint: 'trending', limit: 20, rating: 'pg-13' },
        });
        setTrending((data?.results || []) as GiphyGif[]);
      } catch (e) {
        console.warn('Failed to load trending GIFs', e);
      }
    };
    loadTrending();
  }, []);

  const searchGiphy = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await db.functions.invoke('giphy-search', {
        body: { endpoint: 'search', query: searchQuery, limit: 30, rating: 'pg-13' },
      });
      setResults((data?.results || []) as GiphyGif[]);
    } catch (e) {
      console.warn('GIPHY search failed', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchGiphy(value), 400);
  };

  const gifs = query.trim() ? results : trending;
  const showingTrending = !query.trim();

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2 text-sm font-semibold">
        🔍 Search GIPHY for Ban GIF
      </Label>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search GIFs... (e.g. 'you got banned')"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="pl-9 pr-9 rounded-xl"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Clear selection */}
      {selectedGifUrl && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSelectGif(null)}
          className="text-xs text-muted-foreground"
        >
          <X className="h-3 w-3 mr-1" />
          Use Random Background
        </Button>
      )}

      {/* Results label */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {showingTrending ? (
          <>
            <TrendingUp className="h-3 w-3" />
            Trending
          </>
        ) : isLoading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching...
          </>
        ) : (
          <span>{results.length} results</span>
        )}
      </div>

      {/* GIF Grid */}
      <ScrollArea className="h-52 border border-border rounded-xl p-2 bg-muted/30">
        <div className="grid grid-cols-3 gap-1.5">
          <AnimatePresence mode="popLayout">
            {gifs.map((gif) => {
              const fullUrl = gif.url || gif.mediumUrl || gif.previewUrl;
              const isSelected = selectedGifUrl === fullUrl;
              return (
                <motion.button
                  key={gif.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => onSelectGif(isSelected ? null : fullUrl)}
                  className={cn(
                    "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                    isSelected
                      ? "border-primary ring-2 ring-primary/40 scale-[1.03]"
                      : "border-transparent hover:border-primary/40"
                  )}
                >
                  <img
                    src={gif.mediumUrl || gif.previewUrl || fullUrl}
                    alt={gif.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                      <span className="text-white text-lg drop-shadow-lg">✓</span>
                    </div>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
        {gifs.length === 0 && !isLoading && query.trim() && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
            <p className="text-sm">No GIFs found</p>
            <p className="text-xs">Try a different search</p>
          </div>
        )}
      </ScrollArea>

      {/* Preview */}
      {selectedGifUrl && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Preview (fills entire screen):</Label>
          <div className="relative rounded-xl overflow-hidden border border-border bg-black aspect-video">
            <img
              src={selectedGifUrl}
              alt="Selected GIF"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* GIPHY attribution */}
      <p className="text-[10px] text-muted-foreground/50 text-center">Powered by GIPHY</p>
    </div>
  );
};
