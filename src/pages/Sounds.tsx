import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Search, TrendingUp, Heart, ArrowLeft, Music2, Zap, Star, Upload
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useTrendingSounds, useNewSounds, useSavedSounds, useMySounds } from '@/hooks/useSounds';
import { SoundCard } from '@/components/sounds/SoundCard';
import { SoundPlayer } from '@/components/sounds/SoundPlayer';
import { SoundUploadSheet } from '@/components/sounds/SoundUploadSheet';

function EqBars() {
  return (
    <div className="flex items-end gap-[2px] h-5">
      {[1, 2, 3, 4].map(i => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-primary"
          animate={{ height: ['30%', '100%', '50%', '80%', '30%'] }}
          transition={{ repeat: Infinity, duration: 0.8 + i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export default function SoundsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('trending');
  const [selectedSound, setSelectedSound] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const trendingQuery = useTrendingSounds();
  const { data: trendingSounds, isLoading: loadingTrending } = trendingQuery;
  const newQuery = useNewSounds();
  const { data: newSounds, isLoading: loadingNew } = newQuery;
  const savedQuery = useSavedSounds();
  const { data: savedSounds, isLoading: loadingSaved } = savedQuery;
  const mineQuery = useMySounds();
  const currentQuery = activeTab === 'saved' ? savedQuery : activeTab === 'new' ? newQuery : activeTab === 'recommended' ? mineQuery : trendingQuery;

  const recommendedSounds = mineQuery.data || [];

  const goBack = () => navigate(-1);
  const handleSoundSelect = (soundId: string) => setSelectedSound(soundId);
  const handleUseSound = (soundId: string) => setSelectedSound(soundId);

  const renderSoundGrid = (sounds: any[], isLoading: boolean) => {
    if (currentQuery.isError) return <div role="alert"><p>Sounds could not be loaded. Your uploads have not been removed.</p><Button onClick={() => void currentQuery.refetch()}>Retry sounds</Button></div>;
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-muted/30 rounded-xl mb-3" />
              <div className="h-4 bg-muted/30 rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted/30 rounded w-1/2" />
            </div>
          ))}
        </div>
      );
    }

    const visibleSounds = (sounds || []).filter(sound => `${sound.title} ${sound.artist} ${(sound.tags || []).join(' ')}`.toLowerCase().includes(searchQuery.trim().toLowerCase()));
    if (!visibleSounds.length) {
      return (
        <div className="text-center py-16">
          <div className="relative inline-block mb-4">
            <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-primary/5 to-purple-500/5" />
            <div className="relative w-16 h-16 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/30 flex items-center justify-center">
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.5 }}>
                <Music2 className="h-7 w-7 text-muted-foreground/50" />
              </motion.div>
            </div>
          </div>
          <p className="text-sm font-medium mb-1">No sounds found</p>
          <p className="text-xs text-muted-foreground">Be the first to upload a sound!</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleSounds.map((sound) => (
          <SoundCard
            key={sound.sound_id}
            sound={sound}
            onSelect={handleSoundSelect}
            onUse={handleUseSound}
            isSelected={selectedSound === sound.sound_id}
          />
        ))}
      </div>
    );
  };

  return (
    <AppLayout hideNav>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div
          className="sticky top-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border/50"
          style={{ paddingTop: 'var(--sat, 0px)' }}
        >
          <div className="max-w-screen-xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              
              <div className="flex-1 flex items-center gap-2.5">
                <EqBars />
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Sounds
                  </h1>
                  <p className="text-xs text-muted-foreground">Public original audio · up to 100 recent sounds</p>
                </div>
              </div>
              
              {/* Upload button with shimmer */}
              <button
                onClick={() => setShowUpload(true)}
                className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium overflow-hidden group"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <Upload className="h-3.5 w-3.5 relative z-10" />
                <span className="relative z-10">Upload</span>
              </button>
            </div>

            {/* Search with gradient glow */}
            <div className={cn(
              'mt-4 relative rounded-xl transition-all duration-300',
              searchFocused && 'ring-2 ring-primary/30 shadow-[0_0_16px_rgba(var(--primary-rgb,99,102,241),0.12)]'
            )}>
              <Search className={cn(
                "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors",
                searchFocused ? "text-primary" : "text-muted-foreground"
              )} />
              <Input
                placeholder="Search sounds..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="pl-10 rounded-xl border-border/50 focus:border-transparent focus:ring-0"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-screen-xl mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-8 bg-card/60 backdrop-blur-sm border border-border/30">
              <TabsTrigger aria-label="Browse original sounds" value="trending" className="flex items-center gap-2 data-[state=active]:shadow-sm">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Browse</span>
              </TabsTrigger>
              <TabsTrigger aria-label="New sounds" value="new" className="flex items-center gap-2 data-[state=active]:shadow-sm">
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
              </TabsTrigger>
              <TabsTrigger aria-label="Saved sounds" value="saved" className="flex items-center gap-2 data-[state=active]:shadow-sm">
                <Heart className="h-4 w-4" />
                <span className="hidden sm:inline">Saved</span>
              </TabsTrigger>
              <TabsTrigger aria-label="My uploads" value="recommended" className="flex items-center gap-2 data-[state=active]:shadow-sm">
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">My uploads</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trending" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-red-500" />
                  Browse Originals
                </h2>
                <Badge variant="secondary" className="gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Original audio
                </Badge>
              </div>
              {renderSoundGrid(trendingSounds || [], loadingTrending)}
            </TabsContent>

            <TabsContent value="new" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Fresh Sounds
                </h2>
              </div>
              {renderSoundGrid(newSounds || [], loadingNew)}
            </TabsContent>

            <TabsContent value="saved" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Heart className="h-5 w-5 text-pink-500" />
                  Your Saved Sounds
                </h2>
              </div>
              {renderSoundGrid(savedSounds || [], loadingSaved)}
            </TabsContent>

            <TabsContent value="recommended" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Star className="h-5 w-5 text-purple-500" />
                  My uploads
                </h2>
              </div>
              {renderSoundGrid(recommendedSounds, mineQuery.isLoading)}
            </TabsContent>
          </Tabs>
        </div>

        {selectedSound && (
          <SoundPlayer soundId={selectedSound} onClose={() => setSelectedSound(null)} onUse={handleUseSound} />
        )}
        <SoundUploadSheet open={showUpload} onClose={() => setShowUpload(false)} onPublished={id => { setActiveTab('recommended'); setSelectedSound(id); }} />
      </div>
    </AppLayout>
  );
}
