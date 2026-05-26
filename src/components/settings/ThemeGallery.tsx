import { useState, useMemo, memo, useCallback } from 'react';
import { toast } from 'sonner';
import { Heart, Download, Bookmark, BookmarkCheck, Trash2, Share2, User, TrendingUp, Pencil, Check, X } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';

import {
  useSavedThemes,
  useMySharedThemes,
  useSaveSharedTheme,
  useUnsaveTheme,
  useLikeTheme,
  useUnlikeTheme,
  useUserThemeLikes,
  useDeleteSharedTheme,
  useUpdateSharedTheme,
  SharedTheme,
} from '@/hooks/useSharedThemes';
import { applyThemeTokens } from '@/hooks/useCustomTheme';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { useTheme } from '@/lib/theme';

interface ThemeCardProps {
  theme: SharedTheme;
  isLiked: boolean;
  isSaved: boolean;
  isOwn: boolean;
  isPopular?: boolean;
  isActive?: boolean;
  onLike: () => void;
  onSave: () => void;
  onUnsave: () => void;
  onDelete?: () => void;
  onSelect: () => void;
  onRename?: (newName: string) => void;
}


// Memoized ThemeCard to prevent unnecessary re-renders
const ThemeCard = memo(function ThemeCard({ 
  theme, 
  isLiked, 
  isSaved, 
  isOwn,
  isPopular,
  isActive,
  onLike, 
  onSave, 
  onUnsave, 
  onDelete,
  onSelect,
  onRename
}: ThemeCardProps) {

  const tokens = theme.theme_tokens;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(theme.theme_name);

  const handleSaveRename = () => {
    if (editName.trim() && editName !== theme.theme_name && onRename) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelRename = () => {
    setEditName(theme.theme_name);
    setIsEditing(false);
  };

  return (
    <div className="relative group">
      <div
        onClick={onSelect}
        className={cn(
          "p-3.5 rounded-2xl border backdrop-blur-xl transition-all cursor-pointer active:scale-[0.98]",
          isActive
            ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-md shadow-primary/10"
            : isPopular
              ? "border-primary/40 bg-primary/5 hover:border-primary/60"
              : "border-border/50 bg-card/40 hover:border-primary/40"
        )}
      >
        {/* Popular badge */}
        {isPopular && !isActive && (
          <div className="absolute -top-2 -right-2 z-10">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium shadow-md">
              <TrendingUp className="h-3 w-3" />
              Popular
            </div>
          </div>
        )}

        {/* Active badge */}
        {isActive && (
          <div className="absolute -top-2 -right-2 z-10">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium shadow-md">
              ✓ Active
            </div>
          </div>
        )}

        {/* Theme Preview */}
        <div
          className="h-24 rounded-xl mb-2.5 relative overflow-hidden shadow-inner"
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
        </div>

        {/* Theme Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-1.5">
            {isEditing && isOwn ? (
              <div className="flex items-center gap-1 flex-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm px-2 rounded-lg"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename();
                    if (e.key === 'Escape') handleCancelRename();
                  }}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveRename(); }}
                  className="p-1.5 rounded-lg hover:bg-primary/20 text-primary"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCancelRename(); }}
                  className="p-1.5 rounded-lg hover:bg-destructive/20 text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-sm truncate flex-1">{theme.theme_name}</h3>
                {isOwn && onRename && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                    className="p-1 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit name"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium",
                  tokens.mode === 'dark' ? "bg-muted/60 text-muted-foreground" : "bg-primary/10 text-primary"
                )}>
                  {tokens.mode}
                </span>
              </>
            )}
          </div>

          {theme.creator && (
            <div className="flex items-center gap-1.5">
              <Avatar className="h-4 w-4">
                <AvatarImage src={theme.creator.avatar_url || undefined} />
                <AvatarFallback className="text-[8px]"><User className="h-2.5 w-2.5" /></AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-muted-foreground truncate">
                {theme.creator.display_name || theme.creator.username || 'Anonymous'}
              </span>
            </div>
          )}

          {/* Stats and actions row */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/30">
            <div className="flex items-center gap-2.5">
              <button
                onClick={(e) => { e.stopPropagation(); onLike(); }}
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <Heart className={cn("h-3.5 w-3.5", isLiked && "fill-primary text-primary")} />
                {theme.likes_count}
              </button>
              <span className="flex items-center gap-1">
                <Download className="h-3.5 w-3.5" />
                {theme.downloads_count}
              </span>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  isSaved ? onUnsave() : onSave();
                }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                {isSaved ? (
                  <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5" />
                )}
              </button>
              {isOwn && onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              )}
            </div>
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
  const { triggerTransition } = useThemeTransition();
  const { setTheme: setGlobalTheme } = useTheme();

  const { data: savedThemes, isLoading: loadingSaved } = useSavedThemes();
  const { data: myThemes, isLoading: loadingMy } = useMySharedThemes();
  const { data: likedIds } = useUserThemeLikes();

  const saveTheme = useSaveSharedTheme();
  const unsaveTheme = useUnsaveTheme();
  const likeTheme = useLikeTheme();
  const unlikeTheme = useUnlikeTheme();
  const deleteTheme = useDeleteSharedTheme();
  const updateTheme = useUpdateSharedTheme();

  const [activeThemeId, setActiveThemeId] = useState<string | null>(() => {
    return localStorage.getItem('vybe-equipped-theme-id');
  });

  // Single action: clicking a theme applies and persists it
  const handleSelectTheme = useCallback((theme: SharedTheme) => {
    const primaryColor = theme.theme_tokens?.colorPrimary || '280 70% 50%';
    const accentColor = theme.theme_tokens?.colorAccent || '330 80% 60%';
    
    // Trigger global theme transition
    triggerTransition(primaryColor, accentColor, () => {
      try {
        // Sync global theme mode so ThemeProvider doesn't fight the class change
        const targetMode = theme.theme_tokens?.mode === 'light' ? 'light' : 'dark';
        setGlobalTheme(targetMode);
        
        applyThemeTokens(theme.theme_tokens);
        setActiveThemeId(theme.id);
        localStorage.setItem('vybe-equipped-theme-id', theme.id);
        localStorage.setItem('vybe-custom-theme', JSON.stringify(theme.theme_tokens));
        toast.success(`Theme "${theme.theme_name}" applied!`);
      } catch (error) {
        console.error('Error applying theme:', error);
      }
    });
  }, [triggerTransition, setGlobalTheme]);


  const handleLike = useCallback((themeId: string, isLiked: boolean) => {
    if (isLiked) {
      unlikeTheme.mutate(themeId);
    } else {
      likeTheme.mutate(themeId);
    }
  }, [unlikeTheme, likeTheme]);

  const handleRename = useCallback((themeId: string, newName: string) => {
    updateTheme.mutate({ themeId, themeName: newName });
  }, [updateTheme]);

  const savedThemeIds = useMemo(() => savedThemes?.map(t => t.id) || [], [savedThemes]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="mine" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-11 p-1 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50">
          <TabsTrigger
            value="mine"
            className="rounded-xl text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            My Themes
          </TabsTrigger>
          <TabsTrigger
            value="saved"
            className="rounded-xl text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            Saved
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-4">
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
                  isActive={activeThemeId === theme.id}
                  onLike={() => handleLike(theme.id, likedIds?.includes(theme.id) || false)}
                  onSave={() => saveTheme.mutate(theme.id)}
                  onUnsave={() => unsaveTheme.mutate(theme.id)}
                  onDelete={() => deleteTheme.mutate(theme.id)}
                  onSelect={() => handleSelectTheme(theme)}
                  onRename={(name) => handleRename(theme.id, name)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Share2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">You haven't shared any themes yet</p>
              <p className="text-xs mt-1">Create one in the Customize tab</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="saved" className="mt-4">
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
                  isActive={activeThemeId === theme.id}
                  onLike={() => handleLike(theme.id, likedIds?.includes(theme.id) || false)}
                  onSave={() => {}}
                  onUnsave={() => unsaveTheme.mutate(theme.id)}
                  onSelect={() => handleSelectTheme(theme)}
                  onRename={theme.creator_id === profile?.id ? (name) => handleRename(theme.id, name) : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Bookmark className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No saved themes</p>
              <p className="text-xs mt-1">Save themes you like to use later</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}