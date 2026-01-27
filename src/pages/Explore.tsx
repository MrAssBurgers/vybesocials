import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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

// Fullscreen TikTok-style clips viewer
const BOTTOM_NAV_HEIGHT = 80;

function FullscreenClipsViewer({
  clips,
  startIndex,
  onClose,
  onSwitchToVideos,
  isLoading,
}: {
  clips: ClipPost[];
  startIndex: number;
  onClose: () => void;
  onSwitchToVideos: () => void;
  isLoading?: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [globalMuted, setGlobalMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const { isSlowConnection } = useNetworkStatus();
  
  // Smart preload videos around current position
  const videoUrls = useMemo(() => clips.map(c => c.media_url), [clips]);
  useVideoPreload(videoUrls, { 
    currentIndex, 
    preloadDepth: isSlowConnection ? 1 : 2,
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
    setGlobalMuted(prev => !prev);
  }, []);

  const containerHeight = isMobileOrTablet ? `calc(100dvh - ${BOTTOM_NAV_HEIGHT}px)` : '100dvh';
  const CardComponent = isMobileOrTablet ? MobileShortCard : ShortCard;

  // Show loading skeleton while fetching
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted" />
          <div className="h-4 w-32 bg-muted rounded" />
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
          className="fixed top-4 left-4 z-30 w-10 h-10 rounded-full bg-background/40 backdrop-blur-md border border-border/20 text-foreground hover:bg-background/60"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Tabs at the top */}
      <div className="fixed top-0 left-0 right-0 z-40 px-4 pt-4 pb-2 bg-gradient-to-b from-background via-background/80 to-transparent">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 w-10 h-10 rounded-full bg-background/40 backdrop-blur-md border border-border/20 text-foreground hover:bg-background/60"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>
          
          <div className="flex items-center gap-1 p-1 rounded-full bg-card/60 backdrop-blur-xl border border-border/30">
            <button
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                "bg-primary text-primary-foreground"
              )}
            >
              <Clapperboard className="h-4 w-4" />
              Clips
            </button>
            <button
              onClick={onSwitchToVideos}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                "text-muted-foreground hover:text-foreground hover:bg-card/80"
              )}
            >
              <Film className="h-4 w-4" />
              Videos
            </button>
          </div>
        </div>
      </div>

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
  onSwitchToClips,
  searchQuery,
  setSearchQuery,
  handleSearch,
  activeCategory,
  handleCategoryChange,
  selectedTag,
  handleTagClick,
}: {
  videos: ClipPost[];
  isLoading: boolean;
  onSwitchToClips: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  activeCategory: string;
  handleCategoryChange: (cat: string) => void;
  selectedTag: string | null;
  handleTagClick: (tag: string) => void;
}) {
  const { isMobileOrTablet } = useIsMobileOrTablet();

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 space-y-5">
        {/* Tab Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-card/60 backdrop-blur-xl border border-border/30">
              <button
                onClick={onSwitchToClips}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                  "text-muted-foreground hover:text-foreground hover:bg-card/80"
                )}
              >
                <Clapperboard className="h-4 w-4" />
                Clips
              </button>
              <button
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                  "bg-primary text-primary-foreground"
                )}
              >
                <Film className="h-4 w-4" />
                Videos
              </button>
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
  const [viewMode, setViewMode] = useState<'clips' | 'videos'>(
    (searchParams.get('view') as 'clips' | 'videos') || 'clips'
  );
  const selectedTag = searchParams.get('tag');
  const { data: posts, isLoading } = usePosts();

  // Separate clips (shorts) and videos
  const { clips, videos } = useMemo(() => {
    if (!posts) return { clips: [], videos: [] };
    
    const validPosts = posts.filter(post => isValidMediaUrl(post.media_url));
    
    return {
      clips: validPosts.filter(post => post.type === 'short'),
      videos: validPosts.filter(post => post.type === 'video'),
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

  const handleSwitchToVideos = useCallback(() => {
    setViewMode('videos');
    const params = new URLSearchParams(searchParams);
    params.set('view', 'videos');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleSwitchToClips = useCallback(() => {
    setViewMode('clips');
    const params = new URLSearchParams(searchParams);
    params.set('view', 'clips');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleCloseClips = useCallback(() => {
    // Close just returns to videos
    handleSwitchToVideos();
  }, [handleSwitchToVideos]);

  // Clips view - fullscreen TikTok-style auto-play
  if (viewMode === 'clips') {
    return (
      <FullscreenClipsViewer
        clips={filteredContent}
        startIndex={0}
        onClose={handleCloseClips}
        onSwitchToVideos={handleSwitchToVideos}
        isLoading={isLoading}
      />
    );
  }

  // Videos view - gallery with search/filters
  return (
    <VideosGalleryView
      videos={filteredContent}
      isLoading={isLoading}
      onSwitchToClips={handleSwitchToClips}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      handleSearch={handleSearch}
      activeCategory={activeCategory}
      handleCategoryChange={handleCategoryChange}
      selectedTag={selectedTag}
      handleTagClick={handleTagClick}
    />
  );
}