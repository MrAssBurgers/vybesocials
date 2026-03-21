import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, Download, Search, TrendingUp, Clock, Sparkles, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ARFilterDef } from '@/lib/arFilters';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface FilterGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFilter: (filter: ARFilterDef) => void;
  currentFilterId: string | null;
}

type SortMode = 'popular' | 'recent';

export const FilterGallery = memo(function FilterGallery({
  isOpen,
  onClose,
  onSelectFilter,
  currentFilterId,
}: FilterGalleryProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('popular');
  const [uploadName, setUploadName] = useState('');

  // Fetch community filters
  const { data: filters = [], isLoading } = useQuery({
    queryKey: ['community-filters', sort],
    queryFn: async () => {
      const q = supabase
        .from('community_filters')
        .select(`
          *,
          creator:profiles!community_filters_creator_id_fkey(id, username, avatar_url)
        `)
        .eq('is_approved', true)
        .order(sort === 'popular' ? 'use_count' : 'created_at', { ascending: false })
        .limit(50);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen,
  });

  // Fetch user's liked filters
  const { data: likedIds = [] } = useQuery({
    queryKey: ['community-filter-likes', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data } = await supabase
        .from('community_filter_likes')
        .select('filter_id')
        .eq('user_id', profile.id);
      return data?.map(l => l.filter_id) || [];
    },
    enabled: isOpen && !!profile,
  });

  const likedSet = new Set(likedIds);

  const filteredList = search.trim()
    ? filters.filter((f: any) =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.description?.toLowerCase().includes(search.toLowerCase())
      )
    : filters;

  const handleSelect = useCallback(async (filter: any) => {
    // Convert DB filter to ARFilterDef
    const arFilter: ARFilterDef = {
      id: `community-${filter.id}`,
      name: filter.name,
      icon: filter.icon,
      category: filter.category || 'face',
      ...(filter.filter_config as any),
    };
    onSelectFilter(arFilter);
    triggerHaptic('medium');

    // Increment use count
    await supabase.rpc('increment_community_filter_use', { filter_id: filter.id }).catch(() => {});
  }, [onSelectFilter]);

  const handleLike = useCallback(async (filterId: string) => {
    if (!profile) return;
    const isLiked = likedSet.has(filterId);

    if (isLiked) {
      await supabase
        .from('community_filter_likes')
        .delete()
        .eq('filter_id', filterId)
        .eq('user_id', profile.id);
    } else {
      await supabase
        .from('community_filter_likes')
        .insert({ filter_id: filterId, user_id: profile.id });
    }

    triggerHaptic('light');
    queryClient.invalidateQueries({ queryKey: ['community-filter-likes'] });
    queryClient.invalidateQueries({ queryKey: ['community-filters'] });
  }, [profile, likedSet, queryClient]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[250] bg-background flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-5 w-5" />
        </Button>
        <h2 className="font-semibold text-base flex-1">Filter Gallery</h2>
      </div>

      {/* Search + Sort */}
      <div className="px-4 py-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filters..."
            className="h-8 pl-9 text-sm rounded-full bg-muted/40"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setSort('popular')}
            className={cn(
              "flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors",
              sort === 'popular' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            <TrendingUp className="h-3 w-3" /> Popular
          </button>
          <button
            onClick={() => setSort('recent')}
            className={cn(
              "flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors",
              sort === 'recent' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            <Clock className="h-3 w-3" /> Recent
          </button>
        </div>
      </div>

      {/* Filter Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Sparkles className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No community filters yet</p>
            <p className="text-xs text-muted-foreground/60">Create one with AI Generate in the camera!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredList.map((filter: any) => {
              const isActive = currentFilterId === `community-${filter.id}`;
              const isLiked = likedSet.has(filter.id);
              return (
                <motion.button
                  key={filter.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => handleSelect(filter)}
                  className={cn(
                    "relative p-3 rounded-xl border text-left transition-all",
                    isActive
                      ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                      : "border-border/40 bg-card hover:bg-muted/40"
                  )}
                >
                  {/* Icon */}
                  <div className="text-2xl mb-1.5">{filter.icon}</div>

                  {/* Name */}
                  <p className="text-xs font-semibold truncate">{filter.name}</p>

                  {/* Creator */}
                  <div className="flex items-center gap-1 mt-1">
                    <Avatar className="h-3.5 w-3.5">
                      <AvatarImage src={filter.creator?.avatar_url} />
                      <AvatarFallback className="text-[6px]">
                        {filter.creator?.username?.[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[9px] text-muted-foreground truncate">
                      @{filter.creator?.username || 'unknown'}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] text-muted-foreground">
                      {filter.use_count || 0} uses
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLike(filter.id);
                      }}
                      className="flex items-center gap-0.5 ml-auto"
                    >
                      <Heart className={cn("h-3 w-3", isLiked ? "fill-red-500 text-red-500" : "text-muted-foreground")} />
                      <span className="text-[9px] text-muted-foreground">{filter.like_count || 0}</span>
                    </button>
                  </div>

                  {/* Featured badge */}
                  {filter.is_featured && (
                    <span className="absolute top-1.5 right-1.5 text-[8px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
                      ⭐ Featured
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
});
