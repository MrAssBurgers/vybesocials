import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Search, 
  TrendingUp, 
  Clock, 
  Heart,
  ArrowLeft,
  Music2,
  Zap,
  Star,
  MoreVertical,
  Upload
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTrendingSounds, useNewSounds, useSavedSounds } from '@/hooks/useSounds';
import { SoundCard } from '@/components/sounds/SoundCard';
import { SoundPlayer } from '@/components/sounds/SoundPlayer';
import { SoundUploadSheet } from '@/components/sounds/SoundUploadSheet';

export default function SoundsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('trending');
  const [selectedSound, setSelectedSound] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  // Query hooks
  const { data: trendingSounds, isLoading: loadingTrending } = useTrendingSounds();
  const { data: newSounds, isLoading: loadingNew } = useNewSounds();
  const { data: savedSounds, isLoading: loadingSaved } = useSavedSounds();

  const goBack = () => navigate(-1);

  const handleSoundSelect = (soundId: string) => {
    setSelectedSound(soundId);
  };

  const handleUseSound = (soundId: string) => {
    // Navigate to camera with sound preloaded
    navigate('/upload', { state: { selectedSoundId: soundId } });
  };

  const renderSoundGrid = (sounds: any[], isLoading: boolean) => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-muted rounded-lg mb-3" />
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      );
    }

    if (!sounds?.length) {
      return (
        <div className="text-center py-12">
          <Music2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-lg mb-2">No sounds found</p>
          <p className="text-sm text-muted-foreground">Be the first to upload a sound!</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sounds.map((sound) => (
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
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border/50">
          <div className="max-w-screen-xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={goBack}
                className="shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              
              <div className="flex-1">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Music2 className="h-6 w-6 text-primary" />
                  Sounds
                </h1>
                <p className="text-sm text-muted-foreground">
                  Discover trending sounds for your videos
                </p>
              </div>
              
              <Button onClick={() => setShowUpload(true)} size="sm" className="shrink-0">
                <Upload className="h-4 w-4 mr-1.5" />
                Upload
              </Button>
            </div>

            {/* Search */}
            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sounds..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-screen-xl mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-8">
              <TabsTrigger value="trending" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Trending</span>
              </TabsTrigger>
              <TabsTrigger value="new" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
              </TabsTrigger>
              <TabsTrigger value="saved" className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                <span className="hidden sm:inline">Saved</span>
              </TabsTrigger>
              <TabsTrigger value="recommended" className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">For You</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trending" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-red-500" />
                  Trending Now
                </h2>
                <Badge variant="secondary" className="animate-pulse">
                  Live
                </Badge>
              </div>
              {renderSoundGrid(trendingSounds || [], loadingTrending)}
            </TabsContent>

            <TabsContent value="new" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Fresh Sounds
                </h2>
              </div>
              {renderSoundGrid(newSounds || [], loadingNew)}
            </TabsContent>

            <TabsContent value="saved" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Heart className="h-5 w-5 text-pink-500" />
                  Your Saved Sounds
                </h2>
              </div>
              {renderSoundGrid(savedSounds || [], loadingSaved)}
            </TabsContent>

            <TabsContent value="recommended" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Star className="h-5 w-5 text-purple-500" />
                  Recommended for You
                </h2>
              </div>
              <div className="text-center py-12">
                <Star className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-lg mb-2">AI recommendations coming soon!</p>
                <p className="text-sm text-muted-foreground">
                  We're training our AI to learn your music taste
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Floating Sound Player */}
        {selectedSound && (
          <SoundPlayer
            soundId={selectedSound}
            onClose={() => setSelectedSound(null)}
            onUse={handleUseSound}
          />
        )}
      </div>
    </AppLayout>
  );
}