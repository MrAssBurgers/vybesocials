import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, TrendingUp, Sparkles, Users, Heart, Bookmark, Share2, Eye, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { useTrendingFilters, useNewFilters, useTopFilterCreators, useSavedFilters, useSaveFilter, Filter } from '@/hooks/useFilters';
import { FilterCard } from '@/components/filters/FilterCard';
import { FilterDetailSheet } from '@/components/filters/FilterDetailSheet';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

type Tab = 'trending' | 'new' | 'creators' | 'saved';

export default function FiltersPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('trending');
  const [selectedFilter, setSelectedFilter] = useState<Filter | null>(null);

  const { data: trending = [], isLoading: trendingLoading } = useTrendingFilters();
  const { data: newest = [], isLoading: newLoading } = useNewFilters();
  const { data: creators = [], isLoading: creatorsLoading } = useTopFilterCreators();
  const { data: saved = [], isLoading: savedLoading } = useSavedFilters();

  const tabs: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
    { id: 'trending', label: 'Trending', icon: TrendingUp },
    { id: 'new', label: 'New', icon: Sparkles },
    { id: 'creators', label: 'Creators', icon: Users },
    { id: 'saved', label: 'Saved', icon: Bookmark },
  ];

  const currentFilters = activeTab === 'trending' ? trending
    : activeTab === 'new' ? newest
    : activeTab === 'saved' ? saved
    : [];

  const isLoading = activeTab === 'trending' ? trendingLoading
    : activeTab === 'new' ? newLoading
    : activeTab === 'saved' ? savedLoading
    : creatorsLoading;

  return (
    <AppLayout>
      <div className="min-h-screen pb-24">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-display font-bold">Filters</h1>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Search className="h-5 w-5" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-4 pb-3">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveTab(tab.id);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : activeTab === 'creators' ? (
            <div className="space-y-3">
              {creators.map((creator: any, i: number) => (
                <motion.div
                  key={creator.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/50"
                  onClick={() => navigate(`/u/${creator.username}`)}
                >
                  <div className="w-12 h-12 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    {creator.avatar_url ? (
                      <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground font-bold">
                        {(creator.display_name || creator.username)?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{creator.display_name || creator.username}</p>
                    <p className="text-xs text-muted-foreground">@{creator.username}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full text-xs">
                    View
                  </Button>
                </motion.div>
              ))}
              {creators.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No filter creators yet</p>
                  <p className="text-sm mt-1">Be the first to create a filter!</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <AnimatePresence mode="popLayout">
                {currentFilters.map((filter, i) => (
                  <motion.div
                    key={filter.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                  >
                    <FilterCard
                      filter={filter}
                      onTap={() => setSelectedFilter(filter)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              {currentFilters.length === 0 && !isLoading && (
                <div className="col-span-2 text-center py-16 text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No filters here yet</p>
                  <p className="text-sm mt-1">
                    {activeTab === 'saved' ? 'Save filters to see them here' : 'Filters will appear as creators publish them'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filter Detail Sheet */}
      <FilterDetailSheet
        filter={selectedFilter}
        onClose={() => setSelectedFilter(null)}
      />
    </AppLayout>
  );
}
