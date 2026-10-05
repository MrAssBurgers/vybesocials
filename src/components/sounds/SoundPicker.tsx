import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Music2, TrendingUp, Clock, X, Play, Pause } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useTrendingSounds, useNewSounds, useSavedSounds } from '@/hooks/useSounds';
import { SoundCard } from './SoundCard';
import { Sound } from '@/hooks/useSounds';

interface SoundPickerProps {
  open: boolean;
  onClose: () => void;
  onSelectSound: (sound: Sound) => void;
  selectedSoundId?: string | null;
}

export const SoundPicker = memo(function SoundPicker({
  open,
  onClose,
  onSelectSound,
  selectedSoundId
}: SoundPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('trending');

  // Query hooks
  const { data: trendingSounds, isLoading: loadingTrending } = useTrendingSounds();
  const { data: newSounds, isLoading: loadingNew } = useNewSounds();
  const savedQuery = useSavedSounds();
  const { data: savedSounds, isLoading: loadingSaved } = savedQuery;

  const handleSoundSelect = useCallback((sound: Sound) => {
    onSelectSound(sound);
    onClose();
  }, [onSelectSound, onClose]);

  const renderSoundGrid = (sounds: Sound[], isLoading: boolean) => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-2 gap-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-muted rounded-lg mb-2" />
              <div className="h-3 bg-muted rounded w-3/4 mb-1" />
              <div className="h-2 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      );
    }

    if (!sounds?.length) {
      return (
        <div className="text-center py-12">
          <Music2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-2">No sounds found</p>
          <p className="text-xs text-muted-foreground">Try searching or check trending sounds</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        {sounds.map((sound) => (
          <motion.div
            key={sound.sound_id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "relative cursor-pointer group",
              selectedSoundId === sound.sound_id && "ring-2 ring-primary rounded-lg"
            )}
            onClick={() => handleSoundSelect(sound)}
          >
            {/* Cover/Thumbnail */}
            <div className="aspect-square rounded-lg overflow-hidden relative bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-red-500/10">
              {sound.cover_url ? (
                <img
                  src={sound.cover_url}
                  alt={sound.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              {/* Play overlay */}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-background/90 flex items-center justify-center">
                  <Play className="h-4 w-4 ml-0.5" />
                </div>
              </div>

              {/* Trend indicator */}
              {sound.trend_score > 50 && (
                <div className="absolute top-1 right-1">
                  <Badge variant="destructive" className="text-xs px-1 py-0">
                    <TrendingUp className="h-2 w-2" />
                  </Badge>
                </div>
              )}

              {/* Duration */}
              <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded text-[10px]">
                {Math.floor(sound.duration)}s
              </div>
            </div>

            {/* Sound info */}
            <div className="mt-2 space-y-1">
              <h4 className="text-xs font-medium line-clamp-1">{sound.title}</h4>
              <p className="text-xs text-muted-foreground line-clamp-1">{sound.artist}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{sound.usage_count}</span>
                <span>videos</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[80vh] p-0 z-[8000]">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Music2 className="h-5 w-5 text-primary" />
              Choose Sound
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex flex-col h-full">
          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sounds..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-3 mx-4 mt-4">
              <TabsTrigger value="trending" className="text-xs">
                <TrendingUp className="h-3 w-3 mr-1" />
                Trending
              </TabsTrigger>
              <TabsTrigger value="new" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                New
              </TabsTrigger>
              <TabsTrigger value="saved" className="text-xs">
                <Music2 className="h-3 w-3 mr-1" />
                Saved
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="trending" className="h-full m-0">
                <ScrollArea className="h-full">
                  {renderSoundGrid(trendingSounds || [], loadingTrending)}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="new" className="h-full m-0">
                <ScrollArea className="h-full">
                  {renderSoundGrid(newSounds || [], loadingNew)}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="saved" className="h-full m-0">
                <ScrollArea className="h-full">
                  {savedQuery.isError ? <div role="alert" className="p-4">Saved sounds could not be loaded.<Button onClick={() => void savedQuery.refetch()}>Retry saved sounds</Button></div> : <>{renderSoundGrid(savedSounds || [], loadingSaved)}{savedQuery.entries?.some(entry => !entry.sound) && <p className="p-4 text-sm">Some saved references are unavailable. Open Sounds to review or remove them.</p>}</>}
                  {savedQuery.hasNextPage && <Button disabled={savedQuery.isFetchingNextPage} onClick={() => void savedQuery.fetchNextPage()}>Load more saved sounds</Button>}
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>

          {/* No Sound Option */}
          <div className="p-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onSelectSound(null as any); // No sound selected
                onClose();
              }}
            >
              <X className="h-4 w-4 mr-2" />
              No Sound
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});