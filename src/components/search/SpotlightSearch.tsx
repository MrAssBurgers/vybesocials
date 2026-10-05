import { useSocialPostList } from '@/hooks/useSocialPostList';
import { PostListReadStatus } from '@/components/posts/PostListReadStatus';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Users, FileText, Music, Radio, Sparkles, TrendingUp, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

type SearchTab = 'people' | 'posts' | 'hashtags' | 'sounds';

interface SpotlightSearchProps {
  open: boolean;
  onClose: () => void;
}

export function SpotlightSearch({ open, onClose }: SpotlightSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('people');
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [open]);

  // People search
  const { data: people = [], isLoading: loadingPeople } = useQuery({
    queryKey: ['spotlight-people', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const { data } = await db
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .or(`username.ilike.%${debouncedQuery}%,display_name.ilike.%${debouncedQuery}%`)
        .limit(20);
      return data || [];
    },
    enabled: !!debouncedQuery && debouncedQuery.length >= 2 && activeTab === 'people',
  });

  const postQuery = useSocialPostList({ scope: 'search', search: debouncedQuery.trim() }, open && activeTab === 'posts' && debouncedQuery.trim().length >= 2);
  const posts = postQuery.data ?? [], loadingPosts = postQuery.isLoading;

  // Trending suggestions when no query
  const { data: trending = [] } = useQuery({
    queryKey: ['spotlight-trending'],
    queryFn: async () => {
      const { data } = await db
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .order('created_at', { ascending: false })
        .limit(8);
      return data || [];
    },
    enabled: open && !debouncedQuery,
    staleTime: 120000,
  });

  const tabs: { key: SearchTab; label: string; icon: any }[] = [
    { key: 'people', label: 'People', icon: Users },
    { key: 'posts', label: 'Posts', icon: FileText },
    { key: 'hashtags', label: 'Tags', icon: TrendingUp },
    { key: 'sounds', label: 'Sounds', icon: Music },
  ];

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,var(--sat,0px))] pb-2">
          <button onClick={onClose} className="p-2 -ml-1">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people, posts, sounds..."
              className="pl-9 pr-8 h-10 rounded-full bg-muted/40 border-0 text-sm"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'posts' && debouncedQuery.trim().length >= 2 && <PostListReadStatus query={postQuery} />}
        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-20">
          {!debouncedQuery ? (
            // Trending / suggested
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                <TrendingUp className="h-3 w-3 inline mr-1" />
                Suggested
              </p>
              <div className="space-y-1">
                {trending.map((user: any) => (
                  <button
                    key={user.id}
                    onClick={() => { navigate(`/u/${user.username}`); onClose(); }}
                    className="flex items-center gap-3 w-full px-2 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="text-sm bg-primary/10 text-primary">
                        {(user.display_name || user.username)?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-semibold truncate">{user.display_name || user.username}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : activeTab === 'people' ? (
            <div className="space-y-1">
              {loadingPeople ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                    <div className="h-10 w-10 rounded-full bg-muted/40 animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-24 bg-muted/40 rounded animate-pulse" />
                      <div className="h-3 w-16 bg-muted/40 rounded animate-pulse" />
                    </div>
                  </div>
                ))
              ) : people.length > 0 ? (
                people.map((user: any) => (
                  <button
                    key={user.id}
                    onClick={() => { navigate(`/u/${user.username}`); onClose(); }}
                    className="flex items-center gap-3 w-full px-2 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="text-sm bg-primary/10 text-primary">
                        {(user.display_name || user.username)?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{user.display_name || user.username}</p>
                      <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No people found</p>
              )}
            </div>
          ) : activeTab === 'posts' ? (
            <div className="space-y-2">
              {loadingPosts ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 bg-muted/40 rounded-xl animate-pulse" />
                ))
              ) : posts.length > 0 ? (
                posts.map((post: any) => (
                  <button
                    key={post.id}
                    onClick={() => { navigate(post.type === 'short' ? `/clips/${post.id}` : post.type === 'video' ? `/watch/${post.id}` : `/p/${post.id}`); onClose(); }}
                    className="w-full text-left px-3 py-3 rounded-xl hover:bg-muted/40 transition-colors border border-border/20"
                  >
                    <p className="text-sm line-clamp-2">{post.caption || 'Media post'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      @{post.author?.username || 'user'}
                    </p>
                  </button>
                ))
              ) : (
                !postQuery.isError && !postQuery.hasNextPage && !postQuery.hasMoreWindow && <p className="text-sm text-muted-foreground text-center py-8">No posts found</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Search for {activeTab}...
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
