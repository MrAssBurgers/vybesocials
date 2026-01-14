import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, TrendingUp, Film, Play, Flame, Clock, Compass } from 'lucide-react';
import { usePosts } from '@/hooks/usePosts';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { VideoCard } from '@/components/explore/VideoCard';
import { MediaSkeleton } from '@/components/ui/MediaFallback';
import { useSmartPreload } from '@/hooks/useSmartPreload';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const popularTags = ['meme', 'fails', 'pets', 'gaming', 'comedy', 'sports', 'music', 'food', 'tech', 'beauty'];
const categories = [
  { id: 'all', label: 'All', icon: Compass },
  { id: 'trending', label: 'Trending', icon: Flame },
  { id: 'new', label: 'New', icon: Clock },
  { id: 'gaming', label: 'Gaming', icon: Play },
  { id: 'music', label: 'Music', icon: Film },
];

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [activeCategory, setActiveCategory] = useState(searchParams.get('cat') || 'all');
  const selectedTag = searchParams.get('tag');
  const { data: posts, isLoading } = usePosts();

  // Filter posts: only include videos with valid media URLs
  const validVideos = useMemo(() => {
    if (!posts) return [];
    return posts.filter(post => 
      isValidMediaUrl(post.media_url) && 
      (post.type === 'video' || post.type === 'short')
    );
  }, [posts]);

  // Preload images for visible posts
  const mediaUrls = useMemo(() => validVideos.slice(0, 12).map(p => p.thumbnail_url || p.media_url), [validVideos]);
  useSmartPreload({ urls: mediaUrls.filter(Boolean) as string[], preloadAhead: 6, enabled: true });

  // Filter by category, tag, and search query
  const filteredVideos = useMemo(() => {
    let filtered = validVideos;

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
  }, [validVideos, activeCategory, selectedTag, searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchQuery) {
      params.set('q', searchQuery);
    } else {
      params.delete('q');
    }
    setSearchParams(params);
  };

  const handleTagClick = (tag: string) => {
    const params = new URLSearchParams(searchParams);
    if (selectedTag === tag) {
      params.delete('tag');
    } else {
      params.set('tag', tag);
    }
    params.delete('q');
    setSearchParams(params);
    setSearchQuery('');
  };

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    const params = new URLSearchParams(searchParams);
    if (cat !== 'all') {
      params.set('cat', cat);
    } else {
      params.delete('cat');
    }
    setSearchParams(params);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Play className="h-5 w-5 text-primary-foreground" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Explore</h1>
            <p className="text-sm text-muted-foreground">Discover trending videos</p>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch}>
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search videos, creators, and tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 rounded-2xl bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-all"
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
                    "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all shrink-0",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-muted/60 hover:bg-muted text-foreground"
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
                  "cursor-pointer transition-all px-4 py-1.5 text-sm whitespace-nowrap shrink-0 rounded-full",
                  selectedTag === tag 
                    ? "bg-primary hover:bg-primary/90" 
                    : "hover:bg-muted border-muted-foreground/20"
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
        {(selectedTag || searchQuery) && (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {selectedTag ? `#${selectedTag}` : `Results for "${searchQuery}"`}
            </h2>
            <span className="text-sm text-muted-foreground">
              {filteredVideos.length} videos
            </span>
          </div>
        )}

        {/* Video grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <MediaSkeleton className="aspect-video rounded-2xl" />
                <div className="flex gap-3">
                  <MediaSkeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <MediaSkeleton className="h-4 w-full" />
                    <MediaSkeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredVideos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredVideos.map((post) => (
              <VideoCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No videos found</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Try searching for something else or browse trending tags above
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
