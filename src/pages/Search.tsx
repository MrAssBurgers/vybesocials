import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Users, Hash, Newspaper, Music, X, TrendingUp, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { FriendButton } from '@/components/friends/FriendButton';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { haptics } from '@/lib/haptics';
import { useDebounce } from '@/hooks/useDebounce';

type SearchTab = 'people' | 'posts' | 'hashtags' | 'sounds';

const TABS: { id: SearchTab; label: string; icon: React.ElementType }[] = [
  { id: 'people', label: 'People', icon: Users },
  { id: 'posts', label: 'Posts', icon: Newspaper },
  { id: 'hashtags', label: 'Hashtags', icon: Hash },
  { id: 'sounds', label: 'Sounds', icon: Music },
];

function useSearchPeople(query: string) {
  return useQuery({
    queryKey: ['search-people', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5,
  });
}

function useSearchPosts(query: string) {
  return useQuery({
    queryKey: ['search-posts', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const { data, error } = await supabase
        .from('posts')
        .select('id, caption, type, media_url, created_at, like_count, comment_count, author:profiles!user_id(id, username, avatar_url)')
        .ilike('caption', `%${query}%`)
        .order('like_count', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5,
  });
}

function useSearchHashtags(query: string) {
  return useQuery({
    queryKey: ['search-hashtags', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const { data, error } = await supabase
        .from('posts')
        .select('tags')
        .not('tags', 'is', null)
        .limit(200);
      if (error) throw error;
      
      // Extract and count matching tags
      const tagCounts: Record<string, number> = {};
      (data || []).forEach(post => {
        const tags = post.tags as string[] | null;
        if (tags) {
          tags.forEach(tag => {
            const lower = tag.toLowerCase();
            if (lower.includes(query.toLowerCase())) {
              tagCounts[lower] = (tagCounts[lower] || 0) + 1;
            }
          });
        }
      });
      
      return Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5,
  });
}

function useTrendingPeople() {
  return useQuery({
    queryKey: ['trending-people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, follower_count')
        .order('follower_count', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const debouncedQuery = useDebounce(query, 300);
  const [activeTab, setActiveTab] = useState<SearchTab>('people');
  const inputRef = useRef<HTMLInputElement>(null);
  const { profile } = useAuth();

  const { data: people, isLoading: loadingPeople } = useSearchPeople(debouncedQuery);
  const { data: posts, isLoading: loadingPosts } = useSearchPosts(debouncedQuery);
  const { data: hashtags, isLoading: loadingHashtags } = useSearchHashtags(debouncedQuery);
  const { data: trendingPeople } = useTrendingPeople();

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleTabChange = useCallback((tab: SearchTab) => {
    haptics.tap();
    setActiveTab(tab);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const hasQuery = debouncedQuery.length >= 2;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        {/* Search Header */}
        <div className="mb-4">
          <div className="relative">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search people, posts, hashtags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-11 pr-10 h-12 rounded-2xl bg-card/80 backdrop-blur-sm border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 text-base"
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto scrollbar-hide pb-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all shrink-0",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-card border border-border/40"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <AnimatePresence mode="wait">
          {!hasQuery ? (
            <motion.div key="discover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Trending / Suggested People */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Suggested for you</h2>
                </div>
                <div className="space-y-1">
                  {trendingPeople?.filter(p => p.id !== profile?.id).slice(0, 8).map((person, idx) => (
                    <PersonRow key={person.id} person={person} index={idx} />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {activeTab === 'people' && (
                <div className="space-y-1">
                  {loadingPeople ? (
                    <SearchSkeleton />
                  ) : people && people.length > 0 ? (
                    people.map((person, idx) => (
                      <PersonRow key={person.id} person={person} index={idx} />
                    ))
                  ) : (
                    <EmptyResults query={debouncedQuery} type="people" />
                  )}
                </div>
              )}

              {activeTab === 'posts' && (
                <div className="space-y-2">
                  {loadingPosts ? (
                    <SearchSkeleton />
                  ) : posts && posts.length > 0 ? (
                    posts.map((post: any, idx: number) => (
                      <PostRow key={post.id} post={post} index={idx} />
                    ))
                  ) : (
                    <EmptyResults query={debouncedQuery} type="posts" />
                  )}
                </div>
              )}

              {activeTab === 'hashtags' && (
                <div className="space-y-1">
                  {loadingHashtags ? (
                    <SearchSkeleton />
                  ) : hashtags && hashtags.length > 0 ? (
                    hashtags.map((tag, idx) => (
                      <HashtagRow key={tag.tag} tag={tag} index={idx} />
                    ))
                  ) : (
                    <EmptyResults query={debouncedQuery} type="hashtags" />
                  )}
                </div>
              )}

              {activeTab === 'sounds' && (
                <div className="py-12 text-center">
                  <Music className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Sound search coming soon</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}

function PersonRow({ person, index }: { person: any; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.15), duration: 0.2 }}
    >
      <Link
        to={`/u/${person.username}`}
        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-card/80 transition-colors active:scale-[0.98]"
      >
        <Avatar className="h-12 w-12">
          <AvatarImage src={person.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {person.username?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate text-foreground">
            {person.display_name || person.username}
          </p>
          <p className="text-xs text-muted-foreground truncate">@{person.username}</p>
          {person.bio && (
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{person.bio}</p>
          )}
        </div>
        {person.follower_count > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {person.follower_count >= 1000
              ? `${(person.follower_count / 1000).toFixed(1)}k`
              : person.follower_count}{' '}
            followers
          </span>
        )}
      </Link>
    </motion.div>
  );
}

function PostRow({ post, index }: { post: any; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.15), duration: 0.2 }}
    >
      <Link
        to={`/p/${post.id}`}
        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-card/80 transition-colors"
      >
        {post.author && (
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={post.author.avatar_url || undefined} />
            <AvatarFallback className="bg-muted text-foreground text-sm">
              {post.author.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground line-clamp-2">{post.caption || 'No caption'}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">@{post.author?.username}</span>
            <span className="text-xs text-muted-foreground">❤️ {post.like_count || 0}</span>
            <span className="text-xs text-muted-foreground">💬 {post.comment_count || 0}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function HashtagRow({ tag, index }: { tag: { tag: string; count: number }; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.15), duration: 0.2 }}
    >
      <Link
        to={`/explore?tag=${tag.tag}`}
        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-card/80 transition-colors"
      >
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Hash className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-foreground">#{tag.tag}</p>
          <p className="text-xs text-muted-foreground">{tag.count} posts</p>
        </div>
      </Link>
    </motion.div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <div className="h-12 w-12 rounded-full bg-muted/40 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 bg-muted/40 rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-muted/40 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyResults({ query, type }: { query: string; type: string }) {
  return (
    <div className="py-16 text-center">
      <SearchIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">No {type} found</p>
      <p className="text-xs text-muted-foreground mt-1">Try a different search for "{query}"</p>
    </div>
  );
}
