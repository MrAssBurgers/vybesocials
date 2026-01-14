import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, TrendingUp, Film, Play, Flame } from 'lucide-react';
import { usePosts } from '@/hooks/usePosts';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoCard } from '@/components/explore/VideoCard';
import { MediaSkeleton } from '@/components/ui/MediaFallback';
import { useSmartPreload } from '@/hooks/useSmartPreload';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';

const popularTags = ['meme', 'fails', 'pets', 'gaming', 'comedy', 'sports', 'music', 'food'];
const categories = [
  { id: 'all', label: 'All', icon: Flame },
  { id: 'videos', label: 'Videos', icon: Film },
  { id: 'shorts', label: 'Shorts', icon: Play },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
];

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [activeCategory, setActiveCategory] = useState(searchParams.get('cat') || 'all');
  const selectedTag = searchParams.get('tag');
  const { data: posts, isLoading } = usePosts();
  const { isMobileOrTablet } = useIsMobileOrTablet();

  // Filter posts: only include those with valid media URLs
  const validMediaPosts = useMemo(() => {
    if (!posts) return [];
    return posts.filter(post => isValidMediaUrl(post.media_url));
  }, [posts]);

  // Preload images for visible posts
  const mediaUrls = useMemo(() => validMediaPosts.slice(0, 12).map(p => p.media_url), [validMediaPosts]);
  useSmartPreload({ urls: mediaUrls, preloadAhead: 6, enabled: true });

  // Filter by category, tag, and search query
  const filteredPosts = useMemo(() => {
    let filtered = validMediaPosts;

    // Filter by category
    if (activeCategory === 'videos') {
      filtered = filtered.filter(p => p.type === 'video');
    } else if (activeCategory === 'shorts') {
      filtered = filtered.filter(p => p.type === 'short');
    } else if (activeCategory === 'trending') {
      // Sort by engagement (likes + comments)
      filtered = [...filtered].sort((a, b) => 
        (b.like_count + b.comment_count) - (a.like_count + a.comment_count)
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
  }, [validMediaPosts, activeCategory, selectedTag, searchQuery]);

  // Separate long-form videos from shorts for display
  const longFormVideos = useMemo(() => 
    filteredPosts.filter(p => p.type === 'video'),
  [filteredPosts]);

  const shorts = useMemo(() => 
    filteredPosts.filter(p => p.type === 'short'),
  [filteredPosts]);

  const regularPosts = useMemo(() => 
    filteredPosts.filter(p => p.type !== 'video' && p.type !== 'short'),
  [filteredPosts]);

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
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {/* Search */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search videos, creators, and tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-secondary border-border h-12 rounded-full"
            />
          </div>
        </form>

        {/* Category tabs */}
        <div className="mb-4 overflow-x-auto scrollbar-hide">
          <Tabs value={activeCategory} onValueChange={handleCategoryChange}>
            <TabsList className="bg-muted/50 p-1 gap-1">
              {categories.map((cat) => (
                <TabsTrigger 
                  key={cat.id} 
                  value={cat.id}
                  className="gap-2 px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <cat.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{cat.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Trending Tags */}
        <div className="mb-6 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 pb-2">
            {popularTags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTag === tag ? 'default' : 'secondary'}
                className="cursor-pointer hover:bg-primary/80 transition-colors px-4 py-2 text-sm whitespace-nowrap shrink-0"
                onClick={() => handleTagClick(tag)}
              >
                #{tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Results header */}
        {(selectedTag || searchQuery) && (
          <div className="mb-4">
            <h2 className="text-xl font-bold">
              {selectedTag ? `#${selectedTag}` : `Results for "${searchQuery}"`}
            </h2>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <MediaSkeleton className="aspect-video rounded-xl" />
                <div className="flex gap-3">
                  <MediaSkeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <MediaSkeleton className="h-4 w-full" />
                    <MediaSkeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredPosts.length > 0 ? (
          <div className="space-y-8">
            {/* Long-form videos section */}
            {longFormVideos.length > 0 && activeCategory !== 'shorts' && (
              <section>
                {(activeCategory === 'all' || activeCategory === 'trending') && (
                  <div className="flex items-center gap-2 mb-4">
                    <Film className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold text-lg">Videos</h2>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {longFormVideos.map((post) => (
                    <VideoCard key={post.id} post={post} />
                  ))}
                </div>
              </section>
            )}

            {/* Shorts section */}
            {shorts.length > 0 && activeCategory !== 'videos' && (
              <section>
                {(activeCategory === 'all' || activeCategory === 'trending') && (
                  <div className="flex items-center gap-2 mb-4">
                    <Play className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold text-lg">Shorts</h2>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {shorts.slice(0, isMobileOrTablet ? 6 : 12).map((post) => (
                    <VideoCard key={post.id} post={post} variant="compact" />
                  ))}
                </div>
              </section>
            )}

            {/* Other posts */}
            {regularPosts.length > 0 && activeCategory === 'all' && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold text-lg">Posts</h2>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1">
                  {regularPosts.map((post) => (
                    <VideoCard key={post.id} post={post} variant="compact" />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold mb-2">No content found</h3>
            <p className="text-muted-foreground">
              Try searching for something else or browse trending tags
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
