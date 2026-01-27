import { useState, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Heart, Download, Star, TrendingUp, Clock, 
  Palette, Eye, Share2, Copy, Check, X, User, Filter,
  Sparkles, Code
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { 
  usePublicThemes, 
  useSavedThemes, 
  useMySharedThemes,
  useSaveSharedTheme,
  useLikeTheme,
  useUnlikeTheme,
  useUserThemeLikes,
  SharedTheme
} from '@/hooks/useSharedThemes';
import { useExportThemeCode, useImportThemeCode } from '@/hooks/useUISettings';
import { applyThemeTokens, ThemeTokens } from '@/hooks/useCustomTheme';
import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  onLike: () => void;
  onUnlike: () => void;
  onPreview: () => void;
  onInstall: () => void;
  onShare: () => void;
}

const ThemeCard = memo(function ThemeCard({
  theme,
  isLiked,
  onLike,
  onUnlike,
  onPreview,
  onInstall,
  onShare,
}: ThemeCardProps) {
  const tokens = theme.theme_tokens;
  
  // Generate preview gradient
  const previewGradient = `linear-gradient(135deg, 
    hsl(${tokens.colorPrimary}) 0%, 
    hsl(${tokens.colorAccent}) 50%,
    hsl(${tokens.colorSecondary || tokens.bgMain}) 100%)`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative rounded-xl overflow-hidden border border-border bg-card"
    >
      {/* Preview */}
      <div 
        className="h-32 relative cursor-pointer"
        style={{ background: previewGradient }}
        onClick={onPreview}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        
        {/* Quick actions overlay */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onPreview(); }}>
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
        </div>
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

        {/* Stats and Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <button 
              onClick={() => isLiked ? onUnlike() : onLike()}
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <Heart className={cn("h-4 w-4", isLiked && "fill-primary text-primary")} />
              {theme.likes_count}
            </button>
            <span className="flex items-center gap-1">
              <Download className="h-4 w-4" />
              {theme.downloads_count}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onShare}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={onInstall}>
              Install
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

export const ThemeMarketplace = memo(function ThemeMarketplace() {
  const { profile } = useAuth();
  const { triggerTransition } = useThemeTransition();
  
  // Data hooks
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('trending');
  
  const { data: publicThemes = [], isLoading } = usePublicThemes(searchQuery);
  const { data: savedThemes = [] } = useSavedThemes();
  const { data: myThemes = [] } = useMySharedThemes();
  const { data: likedThemeIds = [] } = useUserThemeLikes();
  
  // Mutations
  const saveTheme = useSaveSharedTheme();
  const likeTheme = useLikeTheme();
  const unlikeTheme = useUnlikeTheme();
  const exportCode = useExportThemeCode();
  const importCode = useImportThemeCode();
  
  // State
  const [previewTheme, setPreviewTheme] = useState<SharedTheme | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importCodeInput, setImportCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Filter and sort themes
  const filteredThemes = publicThemes
    .filter(theme => {
      if (selectedCategory === 'all') return true;
      // Use theme tokens to infer category
      const tokens = theme.theme_tokens;
      if (selectedCategory === 'dark') return tokens.mode === 'dark';
      if (selectedCategory === 'light') return tokens.mode === 'light';
      // For other categories, just show all (would need category field in DB)
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'new':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'top':
          return b.likes_count - a.likes_count;
        case 'trending':
        default:
          // Weighted score: likes + downloads, with recency bonus
          const aScore = a.likes_count + a.downloads_count * 0.5;
          const bScore = b.likes_count + b.downloads_count * 0.5;
          return bScore - aScore;
      }
    });

  // Preview theme
  const handlePreview = useCallback((theme: SharedTheme) => {
    setPreviewTheme(theme);
    applyThemeTokens(theme.theme_tokens);
  }, []);

  // Install theme
  const handleInstall = useCallback((theme: SharedTheme) => {
    const tokens = theme.theme_tokens;
    triggerTransition(
      tokens.colorPrimary || '280 70% 50%',
      tokens.colorAccent || '330 80% 60%',
      () => {
        applyThemeTokens(tokens);
        saveTheme.mutate(theme.id);
        setPreviewTheme(null);
      }
    );
  }, [triggerTransition, saveTheme]);

  // Share theme (generate code)
  const handleShare = useCallback(async (theme: SharedTheme) => {
    try {
      const code = await exportCode.mutateAsync(theme.id);
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 3000);
    } catch (err) {
      // Error handled by mutation
    }
  }, [exportCode]);

  // Import theme by code
  const handleImport = useCallback(async () => {
    if (!importCodeInput.trim()) return;
    
    try {
      const theme = await importCode.mutateAsync(importCodeInput.trim());
      if (theme) {
        handleInstall(theme as unknown as SharedTheme);
        setImportDialogOpen(false);
        setImportCodeInput('');
      }
    } catch (err) {
      // Error handled by mutation
    }
  }, [importCodeInput, importCode, handleInstall]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
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
                    value={importCodeInput}
                    onChange={(e) => setImportCodeInput(e.target.value.toUpperCase())}
                    className="font-mono text-center text-lg tracking-wider"
                    maxLength={8}
                  />
                  <Button 
                    className="w-full" 
                    onClick={handleImport}
                    disabled={!importCodeInput.trim() || importCode.isPending}
                  >
                    {importCode.isPending ? 'Importing...' : 'Import Theme'}
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
        {isLoading ? (
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
            <p className="text-muted-foreground">No themes found</p>
          </div>
        ) : (
          filteredThemes.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isLiked={likedThemeIds.includes(theme.id)}
              onLike={() => likeTheme.mutate(theme.id)}
              onUnlike={() => unlikeTheme.mutate(theme.id)}
              onPreview={() => handlePreview(theme)}
              onInstall={() => handleInstall(theme)}
              onShare={() => handleShare(theme)}
            />
          ))
        )}
      </div>

      {/* Preview Dialog */}
      <AnimatePresence>
        {previewTheme && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPreviewTheme(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="max-w-md w-full bg-card rounded-2xl border border-border p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{previewTheme.theme_name}</h3>
                <Button variant="ghost" size="icon" onClick={() => setPreviewTheme(null)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground">
                {previewTheme.description || 'A beautiful custom theme for VYBE'}
              </p>
              
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={previewTheme.creator?.avatar_url || ''} />
                  <AvatarFallback>
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {previewTheme.creator?.display_name || previewTheme.creator?.username}
                  </p>
                  <p className="text-xs text-muted-foreground">Theme Creator</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setPreviewTheme(null)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => handleInstall(previewTheme)}
                >
                  Install Theme
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Copied Code Toast */}
      <AnimatePresence>
        {copiedCode && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-xl px-4 py-3 shadow-lg flex items-center gap-3"
          >
            <Check className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Code copied!</p>
              <p className="text-xs text-muted-foreground font-mono">{copiedCode}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
