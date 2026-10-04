import { useState, memo, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, Heart, Download, Star, TrendingUp, Clock, 
  Palette, User, Code, Trash2
} from 'lucide-react';
import { useThemeActor } from '@/hooks/useThemeActor';
import { useAuth } from '@/lib/auth';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { 
  usePublicThemes, useEquipSharedTheme,
  useLikeTheme,
  useUnlikeTheme,
  useUserThemeLikes,
  useDeleteSharedTheme,
  SharedTheme
} from '@/hooks/useSharedThemes';
import { useImportThemeCode } from '@/hooks/useUISettings';
import { cn } from '@/lib/utils';


const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'neon', label: 'Neon' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'glass', label: 'Glass' },
  { id: 'vibrant', label: 'Vibrant' },
];

const SORT_OPTIONS = [
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'new', label: 'New', icon: Clock },
  { id: 'top', label: 'Top Rated', icon: Star },
];

interface ThemeCardProps {
  theme: SharedTheme;
  isLiked: boolean;
  isActive: boolean;
  isOwner: boolean;
  onLike: () => void;
  onUnlike: () => void;
  onSelect: () => void;
  onDelete: () => void;
}


const ThemeCard = memo(function ThemeCard({
  theme,
  isLiked,
  isActive,
  isOwner,
  onLike,
  onUnlike,
  onSelect,
  onDelete,
}: ThemeCardProps) {

  const tokens = theme.theme_tokens;
  if (!tokens?.colorPrimary) return null;

  // Generate preview gradient
  const previewGradient = `linear-gradient(135deg, 
    hsl(${tokens.colorPrimary}) 0%, 
    hsl(${tokens.colorAccent}) 50%,
    hsl(${tokens.colorSecondary || tokens.bgMain}) 100%)`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onSelect}
      className={cn(
        "group relative rounded-xl overflow-hidden border-2 bg-card cursor-pointer transition-all",
        isActive ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
      )}
    >
      {/* Active badge */}
      {isActive && (
        <div className="absolute top-2 right-2 z-10">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
            ✓ Active
          </div>
        </div>
      )}

      {/* Preview */}
      <div 
        className="h-32 relative"
        style={{ background: previewGradient }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{theme.theme_name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Avatar className="h-5 w-5">
                <AvatarImage src={theme.creator?.avatar_url || ''} />
                <AvatarFallback>
                  <User className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate">
                {theme.creator?.display_name || theme.creator?.username || 'Anonymous'}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        {theme.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {theme.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t border-border">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (isLiked) onUnlike();
              else onLike();
            }}
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            <Heart className={cn("h-4 w-4", isLiked && "fill-primary text-primary")} />
            {theme.likes_count}
          </button>
          <span className="flex items-center gap-1">
            <Download className="h-4 w-4" />
            {theme.downloads_count}
          </span>
          {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="ml-auto flex items-center gap-1 hover:text-destructive transition-colors"
                  aria-label="Delete theme"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this theme?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{theme.theme_name}" will be removed from the marketplace and anyone who saved it. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </motion.div>
  );
});


export const ThemeMarketplace = memo(function ThemeMarketplace() {
  const { profile, user } = useAuth();
  const equip = useEquipSharedTheme();
  const session = useThemeActor();
  
  // Data hooks
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('trending');
  
  const publicQuery = usePublicThemes(searchQuery);
  const { data: publicThemes = [], isLoading } = publicQuery;
  const { data: likedThemeIds = [] } = useUserThemeLikes();
  
  // Mutations
  const likeTheme = useLikeTheme();
  const unlikeTheme = useUnlikeTheme();
  const deleteTheme = useDeleteSharedTheme();
  const importCode = useImportThemeCode();

  
  // State
  const [activeThemeId, setActiveThemeId] = useState<string | null>(() => {
    return localStorage.getItem(`vybe-equipped-theme-id:${user?.id}`);
  });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importCodeInput, setImportCodeInput] = useState('');
  useEffect(() => { setImportDialogOpen(false); setImportCodeInput(''); }, [session.actor]);

  // Filter and sort themes — skip rows with missing/invalid tokens (prevents render crash)
  const filteredThemes = publicThemes
    .filter((theme) => theme.theme_tokens?.colorPrimary)
    .filter(theme => {
      if (selectedCategory === 'all') return true;
      const tokens = theme.theme_tokens;
      if (!tokens) return false;
      if (selectedCategory === 'dark') return tokens.mode === 'dark';
      if (selectedCategory === 'light') return tokens.mode === 'light';
      return theme.category?.toLowerCase() === selectedCategory
        || theme.tags?.some(tag => tag.toLowerCase() === selectedCategory);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'new':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'top':
          return b.likes_count - a.likes_count;
        case 'trending':
        default: {
          // Weighted score: likes + downloads, with recency bonus
          const aScore = a.likes_count + a.downloads_count * 0.5;
          const bScore = b.likes_count + b.downloads_count * 0.5;
          return bScore - aScore;
        }
      }
    });

  const currentView = useRef({ uid: user?.id, importDialogOpen, importCodeInput });
  if (currentView.current.uid !== user?.id || currentView.current.importDialogOpen !== importDialogOpen || currentView.current.importCodeInput !== importCodeInput) currentView.current = { uid: user?.id, importDialogOpen, importCodeInput };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setActiveThemeId(localStorage.getItem(`vybe-equipped-theme-id:${user?.id}`)); }, [user?.id]);
  const handleSelectTheme = useCallback(async (theme: SharedTheme) => {
    if (equip.isPending) return;
    const view = currentView.current;
    try {
      await equip.mutateAsync(theme);
      if (mounted.current && currentView.current === view) setActiveThemeId(theme.id);
    } catch { /* Failed persistence leaves the existing theme intact. */ }
  }, [equip]);

  const handleImport = useCallback(async () => {
    if (!importCodeInput.trim() || importCode.isPending || equip.isPending) return;
    const view = currentView.current;
    try {
      const theme = await importCode.mutateAsync(importCodeInput.trim());
      if (!mounted.current || currentView.current !== view) return;
      await equip.mutateAsync(theme);
      if (!mounted.current || currentView.current !== view) return;
      setActiveThemeId(theme.id); setImportDialogOpen(false); setImportCodeInput('');
    } catch { /* The failing mutation explains the error and the code stays editable. */ }
  }, [importCodeInput, importCode, equip]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <VybeMiniIcon size={20} showSparkles />
            Theme Marketplace
          </CardTitle>
          <CardDescription>
            Discover and share themes with the community
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Import */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search themes..."
                maxLength={80}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Code className="h-4 w-4 mr-2" />
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Theme Code</DialogTitle>
                  <DialogDescription>
                    Enter a theme code to import a shared theme
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Enter theme code (e.g., ABC12345)"
                    disabled={importCode.isPending || equip.isPending}
                    value={importCodeInput}
                    onChange={(e) => setImportCodeInput(e.target.value.toUpperCase())}
                    className="font-mono text-center text-lg tracking-wider"
                    maxLength={8}
                  />
                  <Button 
                    className="w-full" 
                    onClick={handleImport}
                    disabled={!importCodeInput.trim() || importCode.isPending || equip.isPending}
                  >
                    {importCode.isPending ? 'Checking code…' : equip.isPending ? 'Equipping…' : 'Import Theme'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Categories */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          {/* Sort */}
          <p className="text-xs text-muted-foreground">Style filters and sorting apply to the current page.</p>
          <div className="flex gap-2">
            {SORT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <Button
                  key={opt.id}
                  variant={sortBy === opt.id ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setSortBy(opt.id)}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Theme Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {publicQuery.isError ? (
          <div className="col-span-full py-10 text-center"><p>Could not load themes.</p><Button variant="ghost" onClick={() => void publicQuery.restart()}>Retry</Button></div>
        ) : isLoading || publicQuery.isFetching ? (
          // Skeleton loading
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card animate-pulse">
              <div className="h-32 bg-muted" />
              <div className="p-4 space-y-3">
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))
        ) : filteredThemes.length === 0 ? (
          <div className="col-span-2 text-center py-12">
            <Palette className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{publicQuery.hasNextPage || publicQuery.hasPreviousPage ? 'No matching themes on this page' : 'No themes found'}</p>
          </div>
        ) : (
          filteredThemes.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isLiked={likedThemeIds.includes(theme.id)}
              isActive={activeThemeId === theme.id}
              isOwner={!!profile?.id && theme.creator_id === profile.id}
              onLike={() => likeTheme.mutate(theme.id)}
              onUnlike={() => unlikeTheme.mutate(theme.id)}
              onSelect={() => handleSelectTheme(theme)}
              onDelete={() => deleteTheme.mutate(theme.id)}
            />
          ))
        )}
      </div>
      {!publicQuery.isError && (publicQuery.hasNextPage || publicQuery.hasPreviousPage) && (
        <nav aria-label="Theme pages" className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={!publicQuery.hasPreviousPage || publicQuery.isFetching || isLoading} onClick={publicQuery.previousPage}>Previous page</Button>
          <span className="text-sm text-muted-foreground">Page {publicQuery.page}</span>
          <Button variant="outline" disabled={!publicQuery.hasNextPage || publicQuery.isFetching || isLoading} onClick={publicQuery.nextPage}>Next page</Button>
        </nav>
      )}
    </div>
  );
});

