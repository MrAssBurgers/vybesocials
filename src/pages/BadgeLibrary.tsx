import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Lock, Search, Filter } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAllBadges, useUserBadges } from '@/hooks/useBadges';
import { useAuth } from '@/lib/auth';
import { BadgeIcon } from '@/components/badges/BadgeIcon';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  role: { label: 'Staff', icon: '🛡️' },
  patreon: { label: 'Patreon', icon: '💎' },
  referral: { label: 'Referrals', icon: '🤝' },
  challenge: { label: 'Challenges', icon: '🎯' },
  achievement: { label: 'Achievements', icon: '🏆' },
  beta: { label: 'Beta', icon: '🧪' },
  special: { label: 'Special', icon: '✨' },
};

export default function BadgeLibraryPage() {
  const { profile } = useAuth();
  const { data: allBadges, isLoading: loadingBadges } = useAllBadges();
  const { data: userBadges, isLoading: loadingUserBadges } = useUserBadges(profile?.id);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const earnedBadgeIds = useMemo(() => {
    return new Set(userBadges?.map(ub => ub.badge_id) || []);
  }, [userBadges]);

  const filteredBadges = useMemo(() => {
    let badges = allBadges || [];
    
    if (activeCategory !== 'all') {
      badges = badges.filter(b => b.category === activeCategory);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      badges = badges.filter(b => 
        b.name.toLowerCase().includes(searchLower) ||
        b.description?.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort: earned first, then by priority
    return [...badges].sort((a, b) => {
      const aEarned = earnedBadgeIds.has(a.id);
      const bEarned = earnedBadgeIds.has(b.id);
      if (aEarned && !bEarned) return -1;
      if (!aEarned && bEarned) return 1;
      return a.priority - b.priority;
    });
  }, [allBadges, activeCategory, search, earnedBadgeIds]);

  const stats = useMemo(() => {
    const total = allBadges?.length || 0;
    const earned = earnedBadgeIds.size;
    return { total, earned, percentage: total > 0 ? (earned / total) * 100 : 0 };
  }, [allBadges, earnedBadgeIds]);

  const isLoading = loadingBadges || loadingUserBadges;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Award className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Badge Library</h1>
              <p className="text-sm text-muted-foreground">
                Collect and showcase your achievements
              </p>
            </div>
          </div>

          {/* Progress Card */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Collection Progress</span>
              <span className="text-sm text-muted-foreground">
                {stats.earned} / {stats.total} badges
              </span>
            </div>
            <Progress value={stats.percentage} className="h-2" />
          </GlassCard>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-4"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search badges..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </motion.div>

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mb-6">
          <TabsList className="w-full flex-wrap h-auto gap-1 p-1 bg-secondary/50">
            <TabsTrigger value="all" className="flex-1 min-w-[60px]">
              All
            </TabsTrigger>
            {Object.entries(CATEGORY_LABELS).map(([key, { label, icon }]) => (
              <TabsTrigger key={key} value={key} className="flex-1 min-w-[60px] gap-1">
                <span className="hidden sm:inline">{icon}</span>
                <span className="text-xs sm:text-sm">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Badge Grid */}
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : filteredBadges.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
            >
              {filteredBadges.map((badge, idx) => {
                const isEarned = earnedBadgeIds.has(badge.id);
                
                return (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                  >
                    <GlassCard 
                      className={cn(
                        "p-5 flex flex-col items-center justify-center gap-3 relative overflow-hidden transition-all duration-200",
                        isEarned 
                          ? "hover:scale-[1.02] hover:shadow-lg" 
                          : "opacity-50 grayscale"
                      )}
                    >
                      {/* Lock icon for unearned */}
                      {!isEarned && (
                        <div className="absolute top-2.5 right-2.5 z-10">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      
                      <BadgeIcon
                        icon={badge.icon}
                        name={badge.name}
                        description={badge.description}
                        gradient_from={badge.gradient_from}
                        gradient_to={badge.gradient_to}
                        effect={badge.effect}
                        is_animated={badge.is_animated}
                        size="xl"
                        locked={!isEarned}
                        showTooltip={false}
                      />
                      
                      <div className="text-center space-y-0.5 w-full">
                        <p className="font-bold text-sm truncate">
                          {badge.name}
                        </p>
                        {badge.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {badge.description}
                          </p>
                        )}
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <GlassCard className="p-8 inline-block">
                <VybeMiniIcon size={48} showSparkles className="mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No badges found</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or category filter.
                </p>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
