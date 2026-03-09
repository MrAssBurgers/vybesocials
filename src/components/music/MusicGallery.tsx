import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Pause, Heart, X, Clock, Disc, TrendingUp, Star, Share } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Track {
  track_id: string;
  title: string;
  artist: string;
  genre: string;
  duration: number;
  preview_url: string;
  audio_url: string;
  artwork_url?: string;
  provider_id: string;
}

interface TrackUsage {
  track_id: string;
  videos_created: number;
  plays: number;
  shares: number;
  trend_score: number;
}

interface MusicGalleryProps {
  onSelectTrack: (track: Track) => void;
  onClose: () => void;
}

export function MusicGallery({ onSelectTrack, onClose }: MusicGalleryProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackUsage, setTrackUsage] = useState<Record<string, TrackUsage>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [activeTab, setActiveTab] = useState('trending');

  const genres = useMemo(() => {
    const allGenres = tracks.map(t => t.genre).filter(Boolean);
    return [...new Set(allGenres)].sort();
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    let filtered = tracks;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(track => 
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.genre.toLowerCase().includes(query)
      );
    }

    if (selectedGenre) {
      filtered = filtered.filter(track => track.genre === selectedGenre);
    }

    // Sort based on active tab
    switch (activeTab) {
      case 'trending':
        filtered.sort((a, b) => {
          const aUsage = trackUsage[a.track_id]?.trend_score || 0;
          const bUsage = trackUsage[b.track_id]?.trend_score || 0;
          return bUsage - aUsage;
        });
        break;
      case 'recommended':
        // Simple recommendation based on videos created
        filtered.sort((a, b) => {
          const aUsage = trackUsage[a.track_id]?.videos_created || 0;
          const bUsage = trackUsage[b.track_id]?.videos_created || 0;
          return bUsage - aUsage;
        });
        break;
      case 'genres':
        filtered.sort((a, b) => a.genre.localeCompare(b.genre));
        break;
      case 'search':
        // Keep search results as-is or by relevance
        break;
    }

    return filtered;
  }, [tracks, trackUsage, searchQuery, selectedGenre, activeTab]);

  useEffect(() => {
    loadTracks();
    loadTrackUsage();
  }, []);

  const loadTracks = async () => {
    try {
      const { data, error } = await supabase
        .from('licensed_tracks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTracks(data || []);
    } catch (error) {
      console.error('Error loading tracks:', error);
      toast.error('Failed to load music tracks');
    } finally {
      setLoading(false);
    }
  };

  const loadTrackUsage = async () => {
    try {
      const { data, error } = await supabase
        .from('track_usage')
        .select('*');

      if (error) throw error;
      
      const usageMap = (data || []).reduce((acc, usage) => {
        acc[usage.track_id] = usage;
        return acc;
      }, {} as Record<string, TrackUsage>);
      
      setTrackUsage(usageMap);
    } catch (error) {
      console.error('Error loading track usage:', error);
    }
  };

  const togglePlayPreview = useCallback(async (track: Track) => {
    if (currentlyPlaying === track.track_id) {
      // Stop current track
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
        setAudioElement(null);
      }
      setCurrentlyPlaying(null);
    } else {
      // Stop any existing audio
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }

      // Play new track
      const audio = new Audio(track.preview_url);
      audio.volume = 0.7;
      
      audio.addEventListener('ended', () => {
        setCurrentlyPlaying(null);
        setAudioElement(null);
      });

      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        toast.error('Failed to play preview');
        setCurrentlyPlaying(null);
        setAudioElement(null);
      });

      try {
        await audio.play();
        setAudioElement(audio);
        setCurrentlyPlaying(track.track_id);

        // Update play count
        await supabase.rpc('update_track_usage', {
          p_track_id: track.track_id,
          p_plays: 1
        });
      } catch (error) {
        console.error('Error playing audio:', error);
        toast.error('Failed to play preview');
      }
    }
  }, [currentlyPlaying, audioElement]);

  const handleUseSound = (track: Track) => {
    // Stop any playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setAudioElement(null);
    }
    setCurrentlyPlaying(null);
    onSelectTrack(track);
  };

  const handleShareTrack = async (track: Track) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in to share music');
        return;
      }

      // Check profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (!profile) throw new Error('Profile not found');

      // Stop audio if playing
      if (audioElement) {
        audioElement.pause();
        setAudioElement(null);
        setCurrentlyPlaying(null);
      }

      // Create a feed post sharing the track
      const { error } = await supabase.from('posts').insert({
        author_id: profile.id,
        type: 'text',
        caption: `Vibing to "${track.title}" by ${track.artist} 🎵\n#music #discovery #${track.genre.replace(/\s+/g, '').toLowerCase()}`,
        media_url: track.artwork_url || 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?q=80&w=800&auto=format&fit=crop',
      });

      if (error) throw error;

      // Update track usage stats (shares)
      await supabase.rpc('update_track_usage', {
        p_track_id: track.track_id,
        p_shares: 1
      });

      // Simple way to award XP directly (like 50 XP for sharing a track)
      await supabase.from('xp_logs').insert({
        user_id: profile.id,
        amount: 50,
        source: 'share_music',
        description: 'Shared a music track'
      });

      toast.success('Track shared to your feed! +50 XP 🎵');
    } catch (error) {
      console.error('Error sharing track:', error);
      toast.error('Failed to share track');
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
    };
  }, [audioElement]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center">
          <Disc className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg font-medium">Loading music gallery...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-bold">Music Gallery</h1>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search songs, artists, or genres..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveTab('search');
            }}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-4 my-2">
          <TabsTrigger value="trending" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Trending
          </TabsTrigger>
          <TabsTrigger value="recommended" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Recommended
          </TabsTrigger>
          <TabsTrigger value="genres" className="flex items-center gap-2">
            <Disc className="h-4 w-4" />
            Genres
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search
          </TabsTrigger>
        </TabsList>

        {/* Genre filter (only show on genres tab) */}
        {activeTab === 'genres' && (
          <div className="px-4 pb-2">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2">
                <Button
                  variant={selectedGenre === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedGenre(null)}
                >
                  All Genres
                </Button>
                {genres.map((genre) => (
                  <Button
                    key={genre}
                    variant={selectedGenre === genre ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedGenre(genre)}
                  >
                    {genre}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <TabsContent value={activeTab} className="flex-1 mt-0">
          <ScrollArea className="flex-1 px-4">
            {filteredTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Disc className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No tracks found</h3>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? 'Try searching for different keywords'
                    : 'No music tracks have been synced yet. Contact your admin to set up music providers.'
                  }
                </p>
              </div>
            ) : (
              <div className="grid gap-3 pb-6">
                <AnimatePresence>
                  {filteredTracks.map((track, index) => {
                    const usage = trackUsage[track.track_id];
                    const isPlaying = currentlyPlaying === track.track_id;
                    
                    return (
                      <motion.div
                        key={track.track_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: Math.min(index * 0.05, 0.3) }}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
                          isPlaying && "bg-primary/10 border-primary/20"
                        )}
                      >
                        {/* Artwork */}
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {track.artwork_url ? (
                            <img 
                              src={track.artwork_url} 
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Disc className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          
                          {/* Play overlay */}
                          <div 
                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                            onClick={() => togglePlayPreview(track)}
                          >
                            {isPlaying ? (
                              <Pause className="h-4 w-4 text-white" />
                            ) : (
                              <Play className="h-4 w-4 text-white" />
                            )}
                          </div>
                        </div>

                        {/* Track info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{track.title}</h3>
                          <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {track.genre}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(track.duration)}
                            </span>
                            {usage && usage.videos_created > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {usage.videos_created} videos
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => togglePlayPreview(track)}
                          >
                            {isPlaying ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleShareTrack(track)}
                            title="Share to feed"
                          >
                            <Share className="h-4 w-4" />
                          </Button>
                          
                          <Button 
                            size="sm"
                            onClick={() => handleUseSound(track)}
                          >
                            Use Sound
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
