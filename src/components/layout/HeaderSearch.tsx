import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, TrendingUp, Clock, Users, Hash, Film, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface SearchResult {
  type: 'user' | 'post' | 'tag' | 'listing';
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  icon?: React.ReactNode;
}

const trendingTags = ['meme', 'gaming', 'comedy', 'pets', 'music', 'sports'];
const recentSearchesKey = 'vybe-recent-searches';

function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(recentSearchesKey);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  const recent = getRecentSearches().filter(s => s !== query);
  recent.unshift(query);
  localStorage.setItem(recentSearchesKey, JSON.stringify(recent.slice(0, 5)));
}

function clearRecentSearches() {
  localStorage.removeItem(recentSearchesKey);
}

const SearchResultItem = memo(function SearchResultItem({ 
  result, 
  onClick,
  isActive
}: { 
  result: SearchResult; 
  onClick: () => void;
  isActive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left transition-colors rounded-lg",
        isActive ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      {result.type === 'user' ? (
        <Avatar className="h-10 w-10">
          <AvatarImage src={result.imageUrl || undefined} />
          <AvatarFallback>{result.title[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      ) : result.type === 'tag' ? (
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Hash className="h-5 w-5 text-primary" />
        </div>
      ) : result.type === 'listing' ? (
        <div className="h-10 w-10 rounded-lg bg-muted overflow-hidden">
          {result.imageUrl ? (
            <img src={result.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ShoppingBag className="h-5 w-5 m-2.5 text-muted-foreground" />
          )}
        </div>
      ) : (
        <div className="h-10 w-10 rounded-lg bg-muted overflow-hidden">
          {result.imageUrl ? (
            <img src={result.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Film className="h-5 w-5 m-2.5 text-muted-foreground" />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{result.title}</p>
        {result.subtitle && (
          <p className="text-sm text-muted-foreground truncate">{result.subtitle}</p>
        )}
      </div>
      <Badge variant="secondary" className="text-xs capitalize">
        {result.type}
      </Badge>
    </button>
  );
});

export const HeaderSearch = React.forwardRef<HTMLDivElement, { className?: string; variant?: 'default' | 'header' }>(function HeaderSearch({ className, variant = 'default' }, ref) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, [isOpen]);

  // Keyboard shortcut (CMD/CTRL + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Search query
  const { data: searchResults = [], isLoading } = useQuery({
    queryKey: ['header-search', debouncedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!debouncedQuery) return [];

      const results: SearchResult[] = [];

      // Search users
      const { data: users } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .or(`username.ilike.%${debouncedQuery}%,display_name.ilike.%${debouncedQuery}%`)
        .limit(5);

      if (users) {
        users.forEach(user => {
          results.push({
            type: 'user',
            id: user.id,
            title: user.display_name || user.username,
            subtitle: `@${user.username}`,
            imageUrl: user.avatar_url || undefined,
          });
        });
      }

      // Search posts by caption
      const { data: posts } = await supabase
        .from('posts')
        .select('id, caption, media_url, type')
        .ilike('caption', `%${debouncedQuery}%`)
        .limit(5);

      if (posts) {
        posts.forEach(post => {
          results.push({
            type: 'post',
            id: post.id,
            title: post.caption?.slice(0, 50) || 'Untitled post',
            subtitle: post.type === 'short' ? 'Clip' : 'Post',
            imageUrl: post.media_url,
          });
        });
      }

      // Search listings
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title, price, images, category')
        .ilike('title', `%${debouncedQuery}%`)
        .eq('status', 'active')
        .limit(5);

      if (listings) {
        listings.forEach(listing => {
          results.push({
            type: 'listing',
            id: listing.id,
            title: listing.title,
            subtitle: `$${listing.price} · ${listing.category}`,
            imageUrl: listing.images?.[0],
          });
        });
      }

      // Add matching tags
      const tagMatch = trendingTags.filter(tag => 
        tag.toLowerCase().includes(debouncedQuery.toLowerCase())
      );
      tagMatch.forEach(tag => {
        results.push({
          type: 'tag',
          id: tag,
          title: `#${tag}`,
          subtitle: 'Tag',
        });
      });

      return results;
    },
    enabled: debouncedQuery.length > 0,
  });

  const handleSelect = (result: SearchResult) => {
    addRecentSearch(query);
    setIsOpen(false);
    setQuery('');

    switch (result.type) {
      case 'user':
        navigate(`/u/${result.subtitle?.replace('@', '')}`);
        break;
      case 'post':
        navigate(`/p/${result.id}`);
        break;
      case 'tag':
        navigate(`/explore?tag=${result.id}`);
        break;
      case 'listing':
        navigate(`/market?listing=${result.id}`);
        break;
    }
  };

  const handleTagClick = (tag: string) => {
    addRecentSearch(`#${tag}`);
    setIsOpen(false);
    setQuery('');
    navigate(`/explore?tag=${tag}`);
  };

  const handleRecentClick = (search: string) => {
    setQuery(search);
    inputRef.current?.focus();
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  // Keyboard navigation
  useEffect(() => {
    setActiveIndex(0);
  }, [searchResults]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!searchResults.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = searchResults[activeIndex];
      if (result) handleSelect(result);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Search trigger */}
      <div
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className={cn(
          'flex items-center gap-2.5 cursor-pointer min-w-0 w-full h-full transition-colors duration-150',
          variant === 'header'
            ? 'px-3.5 rounded-full border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06] active:scale-[0.99]'
            : 'px-3 py-2 rounded-full bg-secondary/50 hover:bg-secondary',
        )}
      >
        <Search className={cn(
          'shrink-0',
          variant === 'header' ? 'h-3.5 w-3.5 text-muted-foreground/80' : 'h-4 w-4 text-muted-foreground',
        )} />
        <span className={cn(
          'truncate',
          variant === 'header'
            ? 'inline text-[13px] text-muted-foreground/75'
            : 'hidden sm:inline text-sm text-muted-foreground/90',
        )}>
          {variant === 'header' ? 'Search' : 'Search VYBE'}
        </span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      {/* Expanded search overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 lg:hidden"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="fixed inset-x-3 z-50 lg:absolute lg:inset-x-0 lg:top-full lg:mt-2 lg:w-[400px] lg:right-0 lg:left-auto bg-card/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
              style={{ top: 'max(1rem, var(--app-header-height, 5rem))' }}
            >
              {/* Search input */}
              <div className="flex items-center gap-2 p-3 border-b border-border">
                <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search users, posts, tags..."
                  className="border-0 focus-visible:ring-0 p-0 h-auto text-base"
                  autoFocus
                />
                {query && (
                  <button onClick={() => setQuery('')} className="p-1 hover:bg-accent rounded-full">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>

              <ScrollArea className="max-h-[60vh] lg:max-h-[400px]">
                {/* Search results */}
                {debouncedQuery && searchResults.length > 0 && (
                  <div className="p-2">
                    {searchResults.map((result, idx) => (
                      <SearchResultItem
                        key={`${result.type}-${result.id}`}
                        result={result}
                        onClick={() => handleSelect(result)}
                        isActive={idx === activeIndex}
                      />
                    ))}
                  </div>
                )}

                {/* Loading state */}
                {isLoading && (
                  <div className="p-4 text-center text-muted-foreground">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="inline-block"
                    >
                      <Search className="h-5 w-5" />
                    </motion.div>
                  </div>
                )}

                {/* No results */}
                {debouncedQuery && !isLoading && searchResults.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-muted-foreground">No results for "{debouncedQuery}"</p>
                  </div>
                )}

                {/* Default state - recent + trending */}
                {!debouncedQuery && (
                  <div className="p-3 space-y-4">
                    {/* Recent searches */}
                    {recentSearches.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            Recent
                          </div>
                          <button
                            onClick={handleClearRecent}
                            className="text-xs text-primary hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {recentSearches.map((search) => (
                            <button
                              key={search}
                              onClick={() => handleRecentClick(search)}
                              className="px-3 py-1.5 bg-secondary rounded-full text-sm hover:bg-secondary/80 transition-colors"
                            >
                              {search}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Trending tags */}
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                        <TrendingUp className="h-4 w-4" />
                        Trending
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {trendingTags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => handleTagClick(tag)}
                            className="px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm hover:bg-primary/20 transition-colors"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});
HeaderSearch.displayName = 'HeaderSearch';
