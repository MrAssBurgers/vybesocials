import { useState, useMemo, useCallback } from 'react';
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
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosts } from '@/hooks/usePosts';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExploreClipsSection } from '@/components/explore/ExploreClipsSection';
import { ExploreVideosGrid } from '@/components/explore/ExploreVideosGrid';
import { useSmartPreload } from '@/hooks/useSmartPreload';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const popularTags = ['meme', 'fails', 'pets', 'gaming', 'comedy', 'sports', 'music', 'food', 'tech', 'beauty'];

const categories = [
  { id: 'all', label: 'All', icon: Compass },
  { id: 'trending', label: 'Trending', icon: Flame },
  { id: 'new', label: 'New', icon: Clock },
  { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
  { id: 'music', label: 'Music', icon: Music },
];

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [activeCategory, setActiveCategory] = useState(searchParams.get('cat') || 'all');
  const [contentType, setContentType] = useState<'clips' | 'videos'>(
    (searchParams.get('type') as 'clips' | 'videos') || 'clips'
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

  // Get current content based on type
  const currentContent = contentType === 'clips' ? clips : videos;

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

  const handleContentTypeChange = useCallback((type: string) => {
    setContentType(type as 'clips' | 'videos');
    const params = new URLSearchParams(searchParams);
    params.set('type', type);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-neon-pink via-neon-purple to-neon-cyan flex items-center justify-center shadow-lg shadow-primary/30">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-neon-pink via-neon-purple to-neon-cyan bg-clip-text text-transparent">
                Explore
              </h1>
              <p className="text-sm text-muted-foreground">Discover amazing content</p>
            </div>
          </div>
          
          {/* Content type counts */}
          <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clapperboard className="h-4 w-4 text-neon-pink" />
              {clips.length} clips
            </span>
            <span className="flex items-center gap-1.5">
              <Film className="h-4 w-4 text-neon-cyan" />
              {videos.length} videos
            </span>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch}>
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search clips, videos, creators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 rounded-2xl bg-card/80 backdrop-blur-sm border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground"
            />
          </div>
        </form>

        {/* Content Type Tabs */}
        <Tabs value={contentType} onValueChange={handleContentTypeChange} className="w-full">
          <TabsList className="w-full max-w-md bg-card/60 backdrop-blur-sm border border-border/50 p-1 rounded-2xl">
            <TabsTrigger 
              value="clips" 
              className={cn(
                "flex-1 gap-2 rounded-xl transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-neon-pink data-[state=active]:to-neon-purple data-[state=active]:text-white data-[state=active]:shadow-lg"
              )}
            >
              <Clapperboard className="h-4 w-4" />
              Clips
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs bg-white/20 text-inherit">
                {clips.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="videos"
              className={cn(
                "flex-1 gap-2 rounded-xl transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-neon-cyan data-[state=active]:to-neon-purple data-[state=active]:text-white data-[state=active]:shadow-lg"
              )}
            >
              <Film className="h-4 w-4" />
              Videos
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs bg-white/20 text-inherit">
                {videos.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Category chips */}
          <div className="mt-4">
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
                          ? "bg-gradient-to-r from-neon-pink to-neon-purple text-white border-transparent shadow-lg shadow-neon-pink/30"
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
          </div>

          {/* Trending Tags */}
          <ScrollArea className="w-full mt-3">
            <div className="flex gap-2 pb-2">
              {popularTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTag === tag ? 'default' : 'outline'}
                  className={cn(
                    "cursor-pointer transition-all px-3 py-1.5 text-sm whitespace-nowrap shrink-0 rounded-full",
                    selectedTag === tag 
                      ? "bg-gradient-to-r from-neon-cyan to-neon-purple text-white border-transparent shadow-md shadow-neon-cyan/20" 
                      : "bg-card/40 hover:bg-card border-border/50 hover:border-neon-cyan/50 text-muted-foreground hover:text-foreground"
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
                <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/50 mt-3">
                  <h2 className="text-lg font-semibold text-foreground">
                    {selectedTag ? (
                      <span className="text-neon-cyan">#{selectedTag}</span>
                    ) : (
                      <>Results for "<span className="text-primary">{searchQuery}</span>"</>
                    )}
                  </h2>
                  <span className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                    {filteredContent.length} {contentType}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content */}
          <TabsContent value="clips" className="mt-5 focus-visible:outline-none">
            <ExploreClipsSection clips={filteredContent} />
          </TabsContent>

          <TabsContent value="videos" className="mt-5 focus-visible:outline-none">
            <ExploreVideosGrid videos={filteredContent} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
