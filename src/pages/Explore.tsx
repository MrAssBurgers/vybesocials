import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, TrendingUp } from 'lucide-react';
import { usePosts } from '@/hooks/usePosts';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const popularTags = ['meme', 'fails', 'pets', 'gaming', 'comedy', 'sports', 'music', 'food'];

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const selectedTag = searchParams.get('tag');
  const { data: posts, isLoading } = usePosts();

  const filteredPosts = posts?.filter((post) => {
    if (selectedTag) {
      return post.tags.includes(selectedTag);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        post.caption.toLowerCase().includes(query) ||
        post.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        post.author.username.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery) {
      setSearchParams({ q: searchQuery });
    } else {
      setSearchParams({});
    }
  };

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSearchParams({});
    } else {
      setSearchParams({ tag });
    }
    setSearchQuery('');
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search posts, tags, or creators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary border-border h-12"
            />
          </div>
        </form>

        {/* Popular Tags */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Trending Tags</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTag === tag ? 'default' : 'secondary'}
                className="cursor-pointer hover:bg-primary/80 transition-colors px-4 py-2 text-sm"
                onClick={() => handleTagClick(tag)}
              >
                #{tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Results */}
        <div>
          {selectedTag && (
            <h2 className="text-xl font-bold mb-4">Posts tagged #{selectedTag}</h2>
          )}
          {searchQuery && !selectedTag && (
            <h2 className="text-xl font-bold mb-4">Results for "{searchQuery}"</h2>
          )}

          {isLoading ? (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredPosts && filteredPosts.length > 0 ? (
            <div className="grid grid-cols-3 gap-1">
              {filteredPosts.map((post, idx) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Link to={`/p/${post.id}`} className="block relative group">
                    <div className="aspect-square overflow-hidden bg-muted">
                      {post.type === 'video' || post.type === 'short' ? (
                        <video
                          src={post.media_url}
                          className="w-full h-full object-cover"
                          muted
                        />
                      ) : (
                        <img
                          src={post.media_url}
                          alt={post.caption}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
                      <span className="flex items-center gap-1 text-sm font-semibold">
                        ❤️ {post.like_count}
                      </span>
                      <span className="flex items-center gap-1 text-sm font-semibold">
                        💬 {post.comment_count}
                      </span>
                    </div>
                    {/* Video badge */}
                    {(post.type === 'video' || post.type === 'short') && (
                      <div className="absolute top-2 right-2">
                        <span className="text-lg">🎬</span>
                      </div>
                    )}
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-4xl mb-4">🔍</p>
              <p className="text-muted-foreground">No posts found</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
