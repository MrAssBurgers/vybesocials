import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Users, Hash, Newspaper, Music, X, TrendingUp, Sparkles, Contact } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ContactDiscovery = lazy(() => import('@/components/onboarding/ContactDiscovery').then(m => ({ default: m.ContactDiscovery })));

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
    networkMode: 'always',
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });
}

function useSearchPosts(query: string) {
  return useQuery({
    queryKey: ['search-posts', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const { data, error } = await supabase
        .from('posts')
        .select('id, caption, type, media_url, created_at, like_count, comment_count, author:profiles!author_id(id, username, avatar_url)')
        .ilike('caption', `%${query}%`)
        .order('like_count', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: query.length >= 2,
    networkMode: 'always',
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
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
    networkMode: 'always',
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });
}

function useTrendingPeople() {
  return useQuery({
    queryKey: ['trending-people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    networkMode: 'always',
    staleTime: 1000 * 60 * 30,
    placeholderData: (prev) => prev,
  });
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const debouncedQuery = useDebounce(query, 300);
  const [activeTab, setActiveTab] = useState<SearchTab>('people');
  const inputRef = useRef<HTMLInputElement>(null);
  const { profile } = useAuth();
  const [contactsOpen, setContactsOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const { data: people, isPending: loadingPeople, isError: peopleError, refetch: refetchPeople } = useSearchPeople(debouncedQuery);
  const { data: posts, isPending: loadingPosts, isError: postsError, refetch: refetchPosts } = useSearchPosts(debouncedQuery);
  const { data: hashtags, isPending: loadingHashtags, isError: hashtagsError, refetch: refetchHashtags } = useSearchHashtags(debouncedQuery);
  const { data: trendingPeople } = useTrendingPeople();

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
        {/* Search Header with gradient glow */}
        <div className="mb-4">
          <div className={cn(
            'relative rounded-2xl transition-all duration-300',
            inputFocused && 'ring-2 ring-primary/30 shadow-[0_0_20px_rgba(var(--primary-rgb,99,102,241),0.15)]'
          )}>
            <SearchIcon className={cn(
              "absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors",
              inputFocused ? "text-primary" : "text-muted-foreground"
            )} />
            <Input
              ref={inputRef}
              placeholder="Search people, posts, hashtags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              className="pl-11 pr-10 h-12 rounded-2xl bg-card/80 backdrop-blur-sm border-border/50 focus:border-transparent focus:ring-0 text-base"
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

        {/* Capsule Tabs */}
        <LayoutGroup>
          <div className="flex gap-1.5 mb-5 overflow-x-auto scrollbar-hide pb-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors shrink-0 z-10",
                  activeTab === tab.id
                    ? "text-primary-foreground"
                    : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-card border border-border/40"
                )}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="search-tab-pill"
                    className="absolute inset-0 rounded-full bg-primary shadow-md shadow-primary/20"
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}
                <tab.icon className="h-3.5 w-3.5 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>

        {/* Results */}
        <AnimatePresence mode="wait">
          {!hasQuery ? (
            <motion.div key="discover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Find Friends from Contacts — shimmer button */}
              <button
                onClick={() => { haptics.tap(); setContactsOpen(true); }}
                className="relative w-full mb-5 rounded-xl h-12 flex items-center justify-center gap-2 border border-primary/30 text-primary font-medium overflow-hidden group hover:bg-primary/5 transition-colors"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
                <Contact className="h-4 w-4 relative z-10" />
                <span className="relative z-10">Find Friends from Contacts</span>
              </button>

              {/* Suggested People */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">Suggested for you</h2>
                </div>
                <div className="space-y-1">
                  {trendingPeople?.filter(p => p.id !== profile?.id).slice(0, 8).map((person, idx) => (
                    <PersonRow key={person.id} person={person} index={idx} />
                  ))}
                </div>
              </div>

              <Dialog open={contactsOpen} onOpenChange={setContactsOpen}>
                <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Find Friends</DialogTitle>
                  </DialogHeader>
                  <Suspense fallback={<div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>}>
                    <ContactDiscovery />
                  </Suspense>
                </DialogContent>
              </Dialog>
            </motion.div>
          ) : (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {activeTab === 'people' && (
                <div className="space-y-1">
                  {peopleError ? (
                    <div className="py-12 text-center space-y-3">
                      <p className="text-sm text-muted-foreground">Couldn&apos;t load people</p>
                      <Button variant="outline" size="sm" onClick={() => refetchPeople()}>Retry</Button>
                    </div>
                  ) : loadingPeople && !people ? <SearchSkeleton /> : people && people.length > 0 ? (
                    people.map((person, idx) => <PersonRow key={person.id} person={person} index={idx} />)
                  ) : (
                    <EmptyResults query={debouncedQuery} type="people" />
                  )}
                </div>
              )}

              {activeTab === 'posts' && (
                <div className="space-y-2">
                  {postsError ? (
                    <div className="py-12 text-center space-y-3">
                      <p className="text-sm text-muted-foreground">Couldn&apos;t load posts</p>
                      <Button variant="outline" size="sm" onClick={() => refetchPosts()}>Retry</Button>
                    </div>
                  ) : loadingPosts && !posts ? <SearchSkeleton /> : posts && posts.length > 0 ? (
                    posts.map((post: any, idx: number) => <PostRow key={post.id} post={post} index={idx} />)
                  ) : (
                    <EmptyResults query={debouncedQuery} type="posts" />
                  )}
                </div>
              )}

              {activeTab === 'hashtags' && (
                <div className="space-y-1">
                  {hashtagsError ? (
                    <div className="py-12 text-center space-y-3">
                      <p className="text-sm text-muted-foreground">Couldn&apos;t load hashtags</p>
                      <Button variant="outline" size="sm" onClick={() => refetchHashtags()}>Retry</Button>
                    </div>
                  ) : loadingHashtags && !hashtags ? <SearchSkeleton /> : hashtags && hashtags.length > 0 ? (
                    hashtags.map((tag, idx) => <HashtagRow key={tag.tag} tag={tag} index={idx} />)
                  ) : (
                    <EmptyResults query={debouncedQuery} type="hashtags" />
                  )}
                </div>
              )}

              {activeTab === 'sounds' && (
                <div className="py-12 text-center">
                  <div className="relative inline-block mb-3">
                    <div className="absolute -inset-4 rounded-full bg-purple-500/5 animate-pulse" />
                    <Music className="h-10 w-10 text-muted-foreground/50 relative z-10" />
                  </div>
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
        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-card/80 transition-all active:scale-[0.98] group border-l-2 border-transparent hover:border-l-primary/30"
      >
        <Avatar className="h-12 w-12 ring-1 ring-border/30 group-hover:ring-primary/30 transition-all">
          <AvatarImage src={person.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {person.username?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate text-foreground">{person.display_name || person.username}</p>
          <p className="text-xs text-muted-foreground truncate">@{person.username}</p>
          {person.bio && <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{person.bio}</p>}
        </div>
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
            <AvatarFallback className="bg-muted text-foreground text-sm">{post.author.username?.[0]?.toUpperCase()}</AvatarFallback>
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
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
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
      <div className="relative inline-block mb-4">
        <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5" />
        <div className="relative w-16 h-16 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/30 flex items-center justify-center">
          <SearchIcon className="h-7 w-7 text-muted-foreground/40" />
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">No {type} found</p>
      <p className="text-xs text-muted-foreground mt-1">Try a different search for "{query}"</p>
    </div>
  );
}
