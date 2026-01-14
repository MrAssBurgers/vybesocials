import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Download, Bookmark, BookmarkCheck, Trash2, Share2, Eye, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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
import { applyThemeTokens, ThemeTokens } from '@/hooks/useCustomTheme';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface ThemeCardProps {
  theme: SharedTheme;
  isLiked: boolean;
  isSaved: boolean;
  isOwn: boolean;
  onLike: () => void;
  onSave: () => void;
  onUnsave: () => void;
  onDelete?: () => void;
  onPreview: () => void;
}

function ThemeCard({ 
  theme, 
  isLiked, 
  isSaved, 
  isOwn,
  onLike, 
  onSave, 
  onUnsave, 
  onDelete,
  onPreview 
}: ThemeCardProps) {
  const tokens = theme.theme_tokens;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative group"
    >
      <div 
        className="p-4 rounded-xl border-2 border-border hover:border-primary/50 transition-all cursor-pointer"
        onClick={onPreview}
      >
        {/* Theme Preview */}
        <div 
          className="h-24 rounded-lg mb-3 relative overflow-hidden"
          style={{ 
            background: `linear-gradient(135deg, hsl(${tokens.bgMain || '240 10% 4%'}), hsl(${tokens.bgCard || '240 10% 6%'}))` 
          }}
        >
          {/* Accent colors */}
          <div className="absolute bottom-2 left-2 right-2 flex gap-1">
            <div 
              className="h-3 flex-1 rounded-full"
              style={{ background: `hsl(${tokens.colorPrimary || '330 100% 60%'})` }}
            />
            <div 
              className="h-3 flex-1 rounded-full"
              style={{ background: `hsl(${tokens.colorSecondary || '240 10% 12%'})` }}
            />
            <div 
              className="h-3 flex-1 rounded-full"
              style={{ background: `hsl(${tokens.colorAccent || '185 100% 50%'})` }}
            />
          </div>
          
          {/* Preview overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Theme Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm truncate">{theme.theme_name}</h3>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              tokens.mode === 'dark' ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
            )}>
              {tokens.mode}
            </span>
          </div>

          {theme.creator && (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={theme.creator.avatar_url || undefined} />
                <AvatarFallback><User className="h-3 w-3" /></AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate">
                {theme.creator.display_name || theme.creator.username || 'Anonymous'}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onLike(); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Heart className={cn("h-4 w-4", isLiked && "fill-primary text-primary")} />
                {theme.likes_count}
              </button>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Download className="h-4 w-4" />
                {theme.downloads_count}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {isOwn && onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  isSaved ? onUnsave() : onSave(); 
                }}
              >
                {isSaved ? (
                  <BookmarkCheck className="h-4 w-4 text-primary" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

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
  const { user } = useAuth();
  const { data: publicThemes, isLoading: loadingPublic } = usePublicThemes();
  const { data: savedThemes, isLoading: loadingSaved } = useSavedThemes();
  const { data: myThemes, isLoading: loadingMy } = useMySharedThemes();
  const { data: likedIds } = useUserThemeLikes();
  
  const saveTheme = useSaveSharedTheme();
  const unsaveTheme = useUnsaveTheme();
  const likeTheme = useLikeTheme();
  const unlikeTheme = useUnlikeTheme();
  const deleteTheme = useDeleteSharedTheme();

  const [previewingTheme, setPreviewingTheme] = useState<SharedTheme | null>(null);

  const handlePreview = (theme: SharedTheme) => {
    setPreviewingTheme(theme);
    try {
      applyThemeTokens(theme.theme_tokens);
    } catch (error) {
      console.error('Error previewing theme:', error);
    }
  };

  const handleLike = (themeId: string, isLiked: boolean) => {
    if (isLiked) {
      unlikeTheme.mutate(themeId);
    } else {
      likeTheme.mutate(themeId);
    }
  };

  const savedThemeIds = savedThemes?.map(t => t.id) || [];

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

          <TabsContent value="discover" className="mt-0">
            {loadingPublic ? (
              <ThemeGridSkeleton />
            ) : publicThemes?.length ? (
              <div className="grid grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {publicThemes.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      isLiked={likedIds?.includes(theme.id) || false}
                      isSaved={savedThemeIds.includes(theme.id)}
                      isOwn={theme.creator_id === user?.id}
                      onLike={() => handleLike(theme.id, likedIds?.includes(theme.id) || false)}
                      onSave={() => saveTheme.mutate(theme.id)}
                      onUnsave={() => unsaveTheme.mutate(theme.id)}
                      onDelete={theme.creator_id === user?.id ? () => deleteTheme.mutate(theme.id) : undefined}
                      onPreview={() => handlePreview(theme)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Share2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No shared themes yet</p>
                <p className="text-sm">Be the first to share your VYBE!</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="saved" className="mt-0">
            {loadingSaved ? (
              <ThemeGridSkeleton />
            ) : savedThemes?.length ? (
              <div className="grid grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {savedThemes.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      isLiked={likedIds?.includes(theme.id) || false}
                      isSaved={true}
                      isOwn={theme.creator_id === user?.id}
                      onLike={() => handleLike(theme.id, likedIds?.includes(theme.id) || false)}
                      onSave={() => {}}
                      onUnsave={() => unsaveTheme.mutate(theme.id)}
                      onPreview={() => handlePreview(theme)}
                    />
                  ))}
                </AnimatePresence>
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
                <AnimatePresence mode="popLayout">
                  {myThemes.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      isLiked={likedIds?.includes(theme.id) || false}
                      isSaved={savedThemeIds.includes(theme.id)}
                      isOwn={true}
                      onLike={() => handleLike(theme.id, likedIds?.includes(theme.id) || false)}
                      onSave={() => saveTheme.mutate(theme.id)}
                      onUnsave={() => unsaveTheme.mutate(theme.id)}
                      onDelete={() => deleteTheme.mutate(theme.id)}
                      onPreview={() => handlePreview(theme)}
                    />
                  ))}
                </AnimatePresence>
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
        <AnimatePresence>
          {previewingTheme && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm"
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
