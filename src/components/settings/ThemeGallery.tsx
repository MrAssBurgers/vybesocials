import { useState, useMemo, memo, useCallback } from 'react';
import { toast } from 'sonner';
import { Heart, Download, Bookmark, BookmarkCheck, Trash2, Share2, Eye, User, Search, TrendingUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { NanotechSwoosh } from '@/components/effects/NanotechSwoosh';
import {
  usePublicThemes,
  useSavedThemes,
  useMySharedThemes,
  useSaveSharedTheme,
  useUnsaveTheme,
  useLikeTheme,
  useUnlikeTheme,
  useUserThemeLikes,
  useDeleteSharedTheme,
  SharedTheme,
} from '@/hooks/useSharedThemes';
import { applyThemeTokens } from '@/hooks/useCustomTheme';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface ThemeCardProps {
  theme: SharedTheme;
  isLiked: boolean;
  isSaved: boolean;
  isOwn: boolean;
  isPopular?: boolean;
  isEquipped?: boolean;
  onLike: () => void;
  onSave: () => void;
  onUnsave: () => void;
  onDelete?: () => void;
  onPreview: () => void;
  onEquip: () => void;
}

// Memoized ThemeCard to prevent unnecessary re-renders
const ThemeCard = memo(function ThemeCard({ 
  theme, 
  isLiked, 
  isSaved, 
  isOwn,
  isPopular,
  isEquipped,
  onLike, 
  onSave, 
  onUnsave, 
  onDelete,
  onPreview,
  onEquip
}: ThemeCardProps) {
  const tokens = theme.theme_tokens;

  return (
    <div className="relative group">
      <div 
        className={cn(
          "p-3 rounded-xl border-2 transition-colors",
          isEquipped
            ? "border-primary bg-primary/10 ring-2 ring-primary/30"
            : isPopular 
              ? "border-primary/50 bg-primary/5 hover:border-primary" 
              : "border-border hover:border-primary/50"
        )}
      >
        {/* Popular badge */}
        {isPopular && !isEquipped && (
          <div className="absolute -top-2 -right-2 z-10">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
              <TrendingUp className="h-3 w-3" />
              Popular
            </div>
          </div>
        )}

        {/* Equipped badge */}
        {isEquipped && (
          <div className="absolute -top-2 -right-2 z-10">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500 text-white text-xs font-medium">
              ✓ Equipped
            </div>
          </div>
        )}

        {/* Theme Preview - clickable for preview */}
        <div 
          className="h-20 rounded-lg mb-2 relative overflow-hidden cursor-pointer"
          onClick={onPreview}
          style={{ 
            background: `linear-gradient(135deg, hsl(${tokens.bgMain || '240 10% 4%'}), hsl(${tokens.bgCard || '240 10% 6%'}))` 
          }}
        >
          {/* Accent colors */}
          <div className="absolute bottom-2 left-2 right-2 flex gap-1">
            <div 
              className="h-2.5 flex-1 rounded-full"
              style={{ background: `hsl(${tokens.colorPrimary || '330 100% 60%'})` }}
            />
            <div 
              className="h-2.5 flex-1 rounded-full"
              style={{ background: `hsl(${tokens.colorSecondary || '240 10% 12%'})` }}
            />
            <div 
              className="h-2.5 flex-1 rounded-full"
              style={{ background: `hsl(${tokens.colorAccent || '185 100% 50%'})` }}
            />
          </div>
          
          {/* Preview overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Theme Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-1">
            <h3 className="font-semibold text-xs truncate flex-1">{theme.theme_name}</h3>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0",
              tokens.mode === 'dark' ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
            )}>
              {tokens.mode}
            </span>
          </div>

          {theme.creator && (
            <div className="flex items-center gap-1.5">
              <Avatar className="h-4 w-4">
                <AvatarImage src={theme.creator.avatar_url || undefined} />
                <AvatarFallback className="text-[8px]"><User className="h-2.5 w-2.5" /></AvatarFallback>
              </Avatar>
              <span className="text-[10px] text-muted-foreground truncate">
                {theme.creator.display_name || theme.creator.username || 'Anonymous'}
              </span>
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <button
              onClick={(e) => { e.stopPropagation(); onLike(); }}
              className="flex items-center gap-0.5 hover:text-primary transition-colors"
            >
              <Heart className={cn("h-3 w-3", isLiked && "fill-primary text-primary")} />
              {theme.likes_count}
            </button>
            <span className="flex items-center gap-0.5">
              <Download className="h-3 w-3" />
              {theme.downloads_count}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 pt-1">
            <Button
              size="sm"
              variant={isEquipped ? "secondary" : "default"}
              className="flex-1 h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); onEquip(); }}
              disabled={isEquipped}
            >
              {isEquipped ? '✓ Equipped' : 'Equip'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={(e) => { 
                e.stopPropagation(); 
                isSaved ? onUnsave() : onSave(); 
              }}
            >
              {isSaved ? (
                <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Bookmark className="h-3.5 w-3.5" />
              )}
            </Button>
            {isOwn && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function ThemeGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-4 rounded-xl border border-border">
          <Skeleton className="h-24 rounded-lg mb-3" />
          <Skeleton className="h-4 w-2/3 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function ThemeGallery() {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  
  const { data: publicThemes, isLoading: loadingPublic } = usePublicThemes(debouncedSearch);
  const { data: savedThemes, isLoading: loadingSaved } = useSavedThemes();
  const { data: myThemes, isLoading: loadingMy } = useMySharedThemes();
  const { data: likedIds } = useUserThemeLikes();
  
  const saveTheme = useSaveSharedTheme();
  const unsaveTheme = useUnsaveTheme();
  const likeTheme = useLikeTheme();
  const unlikeTheme = useUnlikeTheme();
  const deleteTheme = useDeleteSharedTheme();

  const [previewingTheme, setPreviewingTheme] = useState<SharedTheme | null>(null);
  const [equippedThemeId, setEquippedThemeId] = useState<string | null>(() => {
    return localStorage.getItem('vybe-equipped-theme-id');
  });
  
  // Nanotech swoosh state
  const [showSwoosh, setShowSwoosh] = useState(false);
  const [pendingEquipTheme, setPendingEquipTheme] = useState<SharedTheme | null>(null);

  // Get top 3 most liked themes as "popular"
  const popularThemeIds = useMemo(() => {
    if (!publicThemes?.length) return new Set<string>();
    return new Set(publicThemes.slice(0, 3).map(t => t.id));
  }, [publicThemes]);

  const handlePreview = useCallback((theme: SharedTheme) => {
    setPreviewingTheme(theme);
    try {
      applyThemeTokens(theme.theme_tokens);
    } catch (error) {
      console.error('Error previewing theme:', error);
    }
  }, []);

  const handleEquip = useCallback((theme: SharedTheme) => {
    // Start swoosh animation - theme will be applied at midpoint
    setPendingEquipTheme(theme);
    setShowSwoosh(true);
  }, []);

  const handleSwooshMidpoint = useCallback(() => {
    if (!pendingEquipTheme) return;
    
    try {
      applyThemeTokens(pendingEquipTheme.theme_tokens);
      setEquippedThemeId(pendingEquipTheme.id);
      localStorage.setItem('vybe-equipped-theme-id', pendingEquipTheme.id);
      localStorage.setItem('vybe-custom-theme', JSON.stringify(pendingEquipTheme.theme_tokens));
      setPreviewingTheme(null);
    } catch (error) {
      console.error('Error equipping theme:', error);
    }
  }, [pendingEquipTheme]);

  const handleSwooshComplete = useCallback(() => {
    if (pendingEquipTheme) {
      toast.success(`Theme "${pendingEquipTheme.theme_name}" equipped!`);
    }
    setShowSwoosh(false);
    setPendingEquipTheme(null);
  }, [pendingEquipTheme]);

  const handleLike = useCallback((themeId: string, isLiked: boolean) => {
    if (isLiked) {
      unlikeTheme.mutate(themeId);
    } else {
      likeTheme.mutate(themeId);
    }
  }, [unlikeTheme, likeTheme]);

  const savedThemeIds = useMemo(() => savedThemes?.map(t => t.id) || [], [savedThemes]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-primary" />
          Theme Gallery
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="discover" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
            <TabsTrigger value="mine">My Themes</TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="mt-0 space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search themes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-secondary border-border"
              />
            </div>

            {/* Popular Section Header (only when not searching) */}
            {!searchQuery && publicThemes && publicThemes.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Sorted by popularity</span>
              </div>
            )}

            {loadingPublic ? (
              <ThemeGridSkeleton />
            ) : publicThemes?.length ? (
              <div className="grid grid-cols-2 gap-3">
                {publicThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    isLiked={likedIds?.includes(theme.id) || false}
                    isSaved={savedThemeIds.includes(theme.id)}
                    isOwn={theme.creator_id === profile?.id}
                    isPopular={popularThemeIds.has(theme.id) && !searchQuery}
                    isEquipped={equippedThemeId === theme.id}
                    onLike={() => handleLike(theme.id, likedIds?.includes(theme.id) || false)}
                    onSave={() => saveTheme.mutate(theme.id)}
                    onUnsave={() => unsaveTheme.mutate(theme.id)}
                    onDelete={theme.creator_id === profile?.id ? () => deleteTheme.mutate(theme.id) : undefined}
                    onPreview={() => handlePreview(theme)}
                    onEquip={() => handleEquip(theme)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? (
                  <>
                    <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No themes found for "{searchQuery}"</p>
                    <p className="text-sm">Try a different search term</p>
                  </>
                ) : (
                  <>
                    <Share2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No shared themes yet</p>
                    <p className="text-sm">Be the first to share your VYBE!</p>
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="saved" className="mt-0">
            {loadingSaved ? (
              <ThemeGridSkeleton />
            ) : savedThemes?.length ? (
              <div className="grid grid-cols-2 gap-3">
                {savedThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    isLiked={likedIds?.includes(theme.id) || false}
                    isSaved={true}
                    isOwn={theme.creator_id === profile?.id}
                    isEquipped={equippedThemeId === theme.id}
                    onLike={() => handleLike(theme.id, likedIds?.includes(theme.id) || false)}
                    onSave={() => {}}
                    onUnsave={() => unsaveTheme.mutate(theme.id)}
                    onPreview={() => handlePreview(theme)}
                    onEquip={() => handleEquip(theme)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Bookmark className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No saved themes</p>
                <p className="text-sm">Save themes you like to use later</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="mine" className="mt-0">
            {loadingMy ? (
              <ThemeGridSkeleton />
            ) : myThemes?.length ? (
              <div className="grid grid-cols-2 gap-3">
                {myThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    isLiked={likedIds?.includes(theme.id) || false}
                    isSaved={savedThemeIds.includes(theme.id)}
                    isOwn={true}
                    isEquipped={equippedThemeId === theme.id}
                    onLike={() => handleLike(theme.id, likedIds?.includes(theme.id) || false)}
                    onSave={() => saveTheme.mutate(theme.id)}
                    onUnsave={() => unsaveTheme.mutate(theme.id)}
                    onDelete={() => deleteTheme.mutate(theme.id)}
                    onPreview={() => handlePreview(theme)}
                    onEquip={() => handleEquip(theme)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Share2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>You haven't shared any themes</p>
                <p className="text-sm">Share your custom themes with the community!</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Preview notification */}
        {previewingTheme && (
          <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
            <div className="flex items-center justify-between">
              <span>Previewing: <strong>{previewingTheme.theme_name}</strong></span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPreviewingTheme(null)}
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Nanotech Swoosh Theme Transition */}
        <NanotechSwoosh
          isActive={showSwoosh}
          primaryColor={pendingEquipTheme?.theme_tokens?.colorPrimary || '280 70% 50%'}
          accentColor={pendingEquipTheme?.theme_tokens?.colorAccent || '330 80% 60%'}
          onMidpoint={handleSwooshMidpoint}
          onComplete={handleSwooshComplete}
          duration={700}
        />
      </CardContent>
    </Card>
  );
}
