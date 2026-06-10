import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Play, 
  Flame, 
  Clock, 
  Compass, 
  Film,
  Clapperboard,
  Gamepad2,
  Music,
  Sparkles,
  X,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosts } from '@/hooks/usePosts';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExploreVideosGrid } from '@/components/explore/ExploreVideosGrid';
import { useSmartPreload } from '@/hooks/useSmartPreload';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ShortCard } from '@/components/posts/ShortCard';
import { MobileShortCard } from '@/components/posts/MobileShortCard';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { useVideoPreload } from '@/hooks/useVideoPreload';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { supabase } from '@/integrations/supabase/client';
import { TrendingCreators } from '@/components/explore/TrendingCreators';
import { TrendingHashtags } from '@/components/explore/TrendingHashtags';

const popularTags = ['meme', 'fails', 'pets', 'gaming', 'comedy', 'sports', 'music', 'food', 'tech', 'beauty'];

const categories = [
  { id: 'all', label: 'All', icon: Compass },
  { id: 'trending', label: 'Trending', icon: Flame },
  { id: 'new', label: 'New', icon: Clock },
  { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
  { id: 'music', label: 'Music', icon: Music },
];

interface ClipPost {
  id: string;
  media_url: string;
  thumbnail_url?: string | null;
  caption: string;
  tags: string[];
  type: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  view_count?: number;
}

// Top tab bar for switching between Clips and Videos - compact version
const ExploreTabBar = memo(function ExploreTabBar({ 
  viewMode, 
  onTabChange 
}: { 
  viewMode: 'clips' | 'videos'; 
  onTabChange: (mode: 'clips' | 'videos') => void;
}) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-card border border-border/40 shadow-lg">
        <button
          onClick={() => onTabChange('clips')}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all",
            viewMode === 'clips'
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          )}
        >
          <Clapperboard className="h-4 w-4" />
          Clips
        </button>
        <button
          onClick={() => onTabChange('videos')}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all",
            viewMode === 'videos'
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          )}
        >
          <Film className="h-4 w-4" />
          Videos
        </button>
      </div>
    </div>
  );
});

const BOTTOM_NAV_HEIGHT = 80;

function FullscreenClipsViewer({
  clips,
  startIndex,
  onClose,
  onSwitchToVideos,
  viewMode,
  onTabChange,
  isLoading,
}: {
  clips: ClipPost[];
  startIndex: number;
  onClose: () => void;
  onSwitchToVideos: () => void;
  viewMode: 'clips' | 'videos';
  onTabChange: (mode: 'clips' | 'videos') => void;
  isLoading?: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [globalMuted, setGlobalMuted] = useState(() => {
    const stored = localStorage.getItem('vybe-clips-muted');
    return stored !== null ? stored === 'true' : true;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const { isSlowConnection } = useNetworkStatus();
  
  // Smart preload videos around current position
  const videoUrls = useMemo(() => clips.map(c => c.media_url), [clips]);
  useVideoPreload(videoUrls, { 
    currentIndex, 
    preloadDepth: isSlowConnection ? 2 : 5,
    enabled: !isSlowConnection 
  });

  // Lock body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Scroll to starting clip on mount
  useEffect(() => {
    const target = itemRefs.current[startIndex];
    if (target) {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, [startIndex]);

  // IntersectionObserver to track current clip
  useEffect(() => {
    if (!clips?.length) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = itemRefs.current.findIndex((ref) => ref === entry.target);
            if (index !== -1 && index !== currentIndex) {
              setCurrentIndex(index);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.6,
      }
    );

    itemRefs.current.forEach((ref) => {
      if (ref) observerRef.current?.observe(ref);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [clips?.length, currentIndex]);

  // Keyboard navigation (desktop)
  useEffect(() => {
    if (isMobileOrTablet) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(currentIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(currentIndex - 1);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, clips?.length, isMobileOrTablet, onClose]);

  const scrollToIndex = useCallback((index: number) => {
    if (index < 0 || index >= clips.length) return;
    const target = itemRefs.current[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [clips.length]);

  const handleToggleMute = useCallback(() => {
    setGlobalMuted(prev => {
      const next = !prev;
      localStorage.setItem('vybe-clips-muted', String(next));
      localStorage.setItem('clips-muted', String(next));
      return next;
    });
  }, []);

  const containerHeight = isMobileOrTablet ? `calc(100dvh - ${BOTTOM_NAV_HEIGHT}px)` : '100dvh';
  const CardComponent = isMobileOrTablet ? MobileShortCard : ShortCard;

  // Show loading only on initial load with no cached data
  if (isLoading && clips.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3" data-allow-animation="true">
          <div className="w-12 h-12 rounded-full bg-muted/50 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading clips...</p>
        </div>
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="text-center text-foreground">
          <Play className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">No clips yet</h3>
          <p className="text-muted-foreground mb-6">Be the first to share a clip!</p>
          <Button onClick={onSwitchToVideos} variant="outline" className="bg-card/60 border-border/30 text-foreground hover:bg-card/80">
            <Film className="h-4 w-4 mr-2" />
            Browse Videos Instead
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-4 left-4 z-30 w-10 h-10 rounded-full bg-black/80 border border-border/20 text-foreground hover:bg-black/90"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div
        ref={containerRef}
        className="overflow-y-scroll scrollbar-hide bg-background"
        style={{ 
          height: containerHeight,
          scrollSnapType: 'y mandatory',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          scrollSnapStop: 'always',
        }}
      >
        <div className="flex flex-col w-full">
          {clips.map((clip, index) => (
            <div
              key={clip.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              className="w-full flex-shrink-0 flex justify-center"
              style={{ 
                height: containerHeight,
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                contentVisibility: 'auto',
                containIntrinsicSize: `0 ${containerHeight}`,
              }}
            >
              <div className="relative h-full w-full max-w-[500px]">
                <CardComponent 
                  post={clip} 
                  isActive={index === currentIndex}
                  globalMuted={globalMuted}
                  onToggleMute={handleToggleMute}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="fixed z-30 w-10 h-10 rounded-full bg-black/80 border border-border/20 text-foreground hover:bg-black/90 left-4"
          style={{ top: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.5rem)' }}
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>

        {/* Tab bar at top - pinned to very top with zero gap */}
        <div className="fixed top-0 left-0 right-0 z-30 flex justify-center pt-[var(--sat,0px)]">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <ExploreTabBar viewMode={viewMode} onTabChange={onTabChange} />
          </motion.div>
        </div>

        {/* Progress indicator (desktop only) */}
        {!isMobileOrTablet && (
          <div className="fixed right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 pointer-events-none">
            {clips.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, idx) => {
              const actualIdx = Math.max(0, currentIndex - 3) + idx;
              return (
                <div
                  key={actualIdx}
                  className="w-1 rounded-full bg-foreground transition-all duration-200"
                  style={{
                    height: actualIdx === currentIndex ? 20 : 6,
                    opacity: actualIdx === currentIndex ? 1 : 0.3,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Swipe hint on first clip (mobile) */}
        {currentIndex === startIndex && isMobileOrTablet && (
          <motion.div 
            className="fixed bottom-36 left-1/2 -translate-x-1/2 pointer-events-none z-20"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ delay: 2, duration: 1 }}
          >
            <div className="text-muted-foreground text-sm flex flex-col items-center animate-pulse">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              <span className="font-medium">Swipe up</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// Videos Gallery View
function VideosGalleryView({
  videos,
  isLoading,
  viewMode,
  onTabChange,
  searchQuery,
  setSearchQuery,
  handleSearch,
  activeCategory,
  handleCategoryChange,
  selectedTag,
  handleTagClick,
  trendingCreators,
  trendingTags,
}: {
  videos: ClipPost[];
  isLoading: boolean;
  viewMode: 'clips' | 'videos';
  onTabChange: (mode: 'clips' | 'videos') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  activeCategory: string;
  handleCategoryChange: (cat: string) => void;
  selectedTag: string | null;
  handleTagClick: (tag: string) => void;
  trendingCreators: { id: string; username: string; avatar_url: string | null; post_count: number }[];
  trendingTags: { tag: string; count: number }[];
}) {
  const { isMobileOrTablet } = useIsMobileOrTablet();

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 pt-0 pb-4 sm:pt-0 sm:pb-6 space-y-5">
        {/* Tab bar at top */}
        <ExploreTabBar viewMode={viewMode} onTabChange={onTabChange} />
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Film className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Videos
              </h1>
              <p className="text-sm text-muted-foreground">Browse video content</p>
            </div>
          </div>
          
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <Film className="h-4 w-4 text-primary" />
            {videos.length} videos
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch}>
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search videos, creators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 rounded-2xl bg-card/80 backdrop-blur-sm border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground"
            />
          </div>
        </form>

        {/* Trending Creators */}
        <TrendingCreators creators={trendingCreators} />

        {/* Trending Hashtags */}
        <TrendingHashtags tags={trendingTags} selectedTag={selectedTag} onSelect={handleTagClick} />

        {/* Category chips */}
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all shrink-0 border",
                    isActive
                      ? "bg-primary text-primary-foreground border-transparent shadow-lg shadow-primary/30"
                      : "bg-card/60 hover:bg-card border-border/50 text-foreground hover:border-primary/50"
                  )}
                >
                  <cat.icon className="h-4 w-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Trending Tags */}
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {popularTags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTag === tag ? 'default' : 'outline'}
                className={cn(
                  "cursor-pointer transition-all px-3 py-1.5 text-sm whitespace-nowrap shrink-0 rounded-full",
                  selectedTag === tag 
                    ? "bg-primary text-primary-foreground border-transparent shadow-md shadow-primary/20" 
                    : "bg-card/40 hover:bg-card border-border/50 hover:border-primary/50 text-muted-foreground hover:text-foreground"
                )}
                onClick={() => handleTagClick(tag)}
              >
                #{tag}
              </Badge>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Results header */}
        <AnimatePresence>
          {(selectedTag || searchQuery) && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/50">
                <h2 className="text-lg font-semibold text-foreground">
                  {selectedTag ? (
                    <span className="text-primary">#{selectedTag}</span>
                  ) : (
                    <>Results for "<span className="text-primary">{searchQuery}</span>"</>
                  )}
                </h2>
                <span className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                  {videos.length} videos
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Videos Grid */}
        <ExploreVideosGrid videos={videos} isLoading={isLoading} />
      </div>
    </AppLayout>
  );
}

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [activeCategory, setActiveCategory] = useState(searchParams.get('cat') || 'all');
  
  // Persist view mode to localStorage + DB so it remembers user selection
  const [viewMode, setViewMode] = useState<'clips' | 'videos'>(() => {
    // First check URL param, then localStorage, then default to clips
    const urlView = searchParams.get('view') as 'clips' | 'videos';
    if (urlView === 'clips' || urlView === 'videos') return urlView;
    const saved = localStorage.getItem('explore-view-mode');
    return (saved === 'clips' || saved === 'videos') ? saved : 'clips';
  });
  
  // Save to localStorage whenever viewMode changes + sync to DB
  useEffect(() => {
    localStorage.setItem('explore-view-mode', viewMode);
    // Fire-and-forget DB sync
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.id) return;
      supabase
        .from('user_preferences' as any)
        .upsert({
          user_id: user.id,
          explore_view_mode: viewMode,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' })
        .then(() => {});
    });
  }, [viewMode]);
  
  const selectedTag = searchParams.get('tag');
  const { data: posts, isLoading } = usePosts();

  // Compute trending creators from posts
  const trendingCreators = useMemo(() => {
    if (!posts) return [];
    const creatorMap = new Map<string, { id: string; username: string; avatar_url: string | null; post_count: number }>();
    posts.forEach(p => {
      const existing = creatorMap.get(p.author.id);
      if (existing) {
        existing.post_count++;
      } else {
        creatorMap.set(p.author.id, { id: p.author.id, username: p.author.username, avatar_url: p.author.avatar_url, post_count: 1 });
      }
    });
    return Array.from(creatorMap.values())
      .sort((a, b) => b.post_count - a.post_count)
      .slice(0, 10);
  }, [posts]);

  // Compute trending hashtags from posts
  const trendingTags = useMemo(() => {
    if (!posts) return [];
    const tagMap = new Map<string, number>();
    posts.forEach(p => p.tags?.forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1)));
    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [posts]);

  // Separate clips (shorts) and videos
  const { clips, videos } = useMemo(() => {
    if (!posts) return { clips: [], videos: [] };
    
    const validPosts = posts.filter(post => isValidMediaUrl(post.media_url));
    
    return {
      clips: validPosts.filter(post => post.type === 'short'),
      videos: validPosts.filter(post => post.type === 'video' || post.type === 'short'),
    };
  }, [posts]);

  // Get current content based on view mode
  const currentContent = viewMode === 'clips' ? clips : videos;

  // Preload images for visible posts
  const mediaUrls = useMemo(() => 
    currentContent.slice(0, 12).map(p => p.thumbnail_url || p.media_url), 
    [currentContent]
  );
  useSmartPreload({ urls: mediaUrls.filter(Boolean) as string[], preloadAhead: 6, enabled: true });

  // Filter by category, tag, and search query
  const filteredContent = useMemo(() => {
    let filtered = currentContent;

    // Filter by category
    if (activeCategory === 'trending') {
      filtered = [...filtered].sort((a, b) => 
        (b.like_count + b.comment_count) - (a.like_count + a.comment_count)
      );
    } else if (activeCategory === 'new') {
      filtered = [...filtered].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (activeCategory === 'gaming' || activeCategory === 'music') {
      filtered = filtered.filter(post => 
        post.tags?.some(tag => tag.toLowerCase().includes(activeCategory))
      );
    }

    // Filter by tag
    if (selectedTag) {
      filtered = filtered.filter(post => post.tags?.includes(selectedTag));
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((post) =>
        post.caption?.toLowerCase().includes(query) ||
        post.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
        post.author?.username?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [currentContent, activeCategory, selectedTag, searchQuery]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchQuery) {
      params.set('q', searchQuery);
    } else {
      params.delete('q');
    }
    setSearchParams(params);
  }, [searchQuery, searchParams, setSearchParams]);

  const handleTagClick = useCallback((tag: string) => {
    const params = new URLSearchParams(searchParams);
    if (selectedTag === tag) {
      params.delete('tag');
    } else {
      params.set('tag', tag);
    }
    params.delete('q');
    setSearchParams(params);
    setSearchQuery('');
  }, [selectedTag, searchParams, setSearchParams]);

  const handleCategoryChange = useCallback((cat: string) => {
    setActiveCategory(cat);
    const params = new URLSearchParams(searchParams);
    if (cat !== 'all') {
      params.set('cat', cat);
    } else {
      params.delete('cat');
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);


  // Handler for the tab bar to switch modes
  const handleTabChange = useCallback((mode: 'clips' | 'videos') => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams);
    params.set('view', mode);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleCloseClips = useCallback(() => {
    // Close just returns to videos
    handleTabChange('videos');
  }, [handleTabChange]);

  // Clips view - fullscreen TikTok-style auto-play
  if (viewMode === 'clips') {
    return (
      <FullscreenClipsViewer
        clips={filteredContent}
        startIndex={0}
        onClose={handleCloseClips}
        onSwitchToVideos={() => handleTabChange('videos')}
        viewMode={viewMode}
        onTabChange={handleTabChange}
        isLoading={isLoading}
      />
    );
  }

  // Videos view - gallery with search/filters
  return (
    <VideosGalleryView
      videos={filteredContent}
      isLoading={isLoading}
      viewMode={viewMode}
      onTabChange={handleTabChange}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      handleSearch={handleSearch}
      activeCategory={activeCategory}
      handleCategoryChange={handleCategoryChange}
      selectedTag={selectedTag}
      handleTagClick={handleTagClick}
      trendingCreators={trendingCreators}
      trendingTags={trendingTags}
    />
  );
}