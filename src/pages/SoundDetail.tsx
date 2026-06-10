import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Heart, 
  Share2, 
  Download,
  Users,
  TrendingUp,
  Clock,
  Music2,
  Camera,
  RotateCcw,
  BookmarkPlus,
  MoreVertical,
  User
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useSound, useSoundStats, usePostsWithSound, useAudioPlayer, useTrackSoundPlay, useSaveSound, useIsSoundSaved } from '@/hooks/useSounds';
import { WaveformVisualizer } from '@/components/sounds/WaveformVisualizer';
import { PostCard } from '@/components/posts/PostCard';

export default function SoundDetailPage() {
  const { soundId } = useParams<{ soundId: string }>();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);

  const { data: sound, isLoading } = useSound(soundId!);
  const { data: stats } = useSoundStats(soundId!);
  const { data: posts } = usePostsWithSound(soundId!);
  const { data: isSaved = false, refetch: refetchSaved } = useIsSoundSaved(soundId);
  const { saveSound, unsaveSound } = useSaveSound();
  const trackPlay = useTrackSoundPlay();
  const audioUrl = sound?.preview_url || sound?.audio_url || '';
  const audioPlayer = useAudioPlayer(audioUrl);

  useEffect(() => {
    if (audioPlayer.isPlaying && sound) {
      trackPlay(sound.sound_id, 'detail');
    }
  }, [audioPlayer.isPlaying, sound, trackPlay]);

  const goBack = () => navigate(-1);

  const handlePlay = () => {
    audioPlayer.toggle();
  };

  const handleUseSound = () => {
    navigate('/upload', { state: { selectedSoundId: soundId } });
  };

  const handleRemix = () => {
    navigate('/upload', { state: { selectedSoundId: soundId, mode: 'remix' } });
  };

  const handleSaveSound = async () => {
    if (!soundId) return;
    setIsSaving(true);
    try {
      if (isSaved) {
        await unsaveSound(soundId);
        toast.success('Sound removed from saved');
      } else {
        await saveSound(soundId);
        toast.success('Sound saved!');
      }
      await refetchSaved();
    } catch {
      toast.error('Could not update saved sound');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = () => {
    if (navigator.share && sound) {
      navigator.share({
        title: `${sound.title} by ${sound.artist}`,
        text: `Check out this trending sound on VYBE!`,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    }
  };

  if (isLoading) {
    return (
      <AppLayout hideNav>
        <div className="min-h-screen bg-background animate-pulse">
          <div className="h-20 bg-muted" />
          <div className="max-w-screen-xl mx-auto px-4 py-6">
            <div className="h-80 bg-muted rounded-lg mb-6" />
            <div className="space-y-4">
              <div className="h-8 bg-muted rounded w-1/2" />
              <div className="h-4 bg-muted rounded w-1/4" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!sound) {
    return (
      <AppLayout hideNav>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Music2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Sound Not Found</h2>
            <p className="text-muted-foreground mb-4">
              This sound may have been removed or doesn't exist.
            </p>
            <Button onClick={goBack}>Go Back</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideNav>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div
          className="sticky top-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border/50"
          style={{ paddingTop: 'var(--sat, 0px)' }}
        >
          <div className="max-w-screen-xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={goBack}
                  className="shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-semibold line-clamp-1">{sound.title}</h1>
                  <p className="text-sm text-muted-foreground">by {sound.artist}</p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleShare}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share Sound
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="max-w-screen-xl mx-auto px-4 py-6">
          {/* Hero Section */}
          <Card className="p-6 mb-8 bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
            <div className="flex flex-col lg:flex-row gap-6 items-center">
              {/* Cover Art */}
              <div className="relative group">
                <div className="w-48 h-48 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 p-1">
                  <div className="w-full h-full rounded-xl bg-background flex items-center justify-center">
                    {sound.cover_url ? (
                      <img 
                        src={sound.cover_url} 
                        alt={sound.title}
                        className="w-full h-full rounded-xl object-cover"
                      />
                    ) : (
                      <Music2 className="h-16 w-16 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Play Button Overlay */}
                <Button
                  size="icon"
                  onClick={handlePlay}
                  className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-primary/90 hover:bg-primary shadow-2xl"
                >
                  {audioPlayer.isPlaying ? (
                    <Pause className="h-8 w-8" />
                  ) : (
                    <Play className="h-8 w-8 ml-1" />
                  )}
                </Button>
              </div>

              {/* Sound Info */}
              <div className="flex-1 text-center lg:text-left space-y-4">
                <div>
                  <h2 className="text-3xl font-bold mb-2">{sound.title}</h2>
                  <p className="text-xl text-muted-foreground">by {sound.artist}</p>
                  {sound.tags && (
                    <div className="flex flex-wrap gap-2 mt-3 justify-center lg:justify-start">
                      {sound.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">#{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 justify-center lg:justify-start text-sm">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">{sound.usage_count.toLocaleString()}</span>
                    <span className="text-muted-foreground">videos</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="font-medium">{Math.round(sound.trend_score)}</span>
                    <span className="text-muted-foreground">trend score</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(sound.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                {/* Waveform */}
                {sound.waveform_data && (
                  <div className="w-full max-w-md mx-auto lg:mx-0">
                    <WaveformVisualizer 
                      waveformData={sound.waveform_data} 
                      isPlaying={audioPlayer.isPlaying}
                      duration={sound.duration}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <Separator className="my-6" />
            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={handleUseSound} className="flex-1 sm:flex-none">
                <Camera className="h-4 w-4 mr-2" />
                Use Sound
              </Button>
              <Button onClick={handleRemix} variant="secondary" className="flex-1 sm:flex-none">
                <RotateCcw className="h-4 w-4 mr-2" />
                Remix
              </Button>
              <Button 
                onClick={handleSaveSound} 
                variant={isSaved ? "default" : "outline"}
                size="icon"
                disabled={isSaving}
              >
                <Heart className={cn("h-4 w-4", isSaved && "fill-current")} />
              </Button>
              <Button onClick={handleShare} variant="outline" size="icon">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          {/* Creator Info */}
          {sound.uploader_profile && (
            <Card className="p-4 mb-8">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={sound.uploader_profile.avatar_url} />
                  <AvatarFallback>
                    <User className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium">{sound.uploader_profile.display_name}</p>
                  <p className="text-sm text-muted-foreground">Sound Creator</p>
                </div>
                <Button variant="outline" size="sm">
                  Follow
                </Button>
              </div>
            </Card>
          )}

          {/* Videos Using This Sound */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-semibold">Videos using this sound</h3>
              <Badge variant="secondary">
                {sound.usage_count} videos
              </Badge>
            </div>

            {posts && posts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Camera className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-lg mb-2">No videos yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Be the first to create a video with this sound!
                </p>
                <Button onClick={handleUseSound}>
                  <Camera className="h-4 w-4 mr-2" />
                  Create Video
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}