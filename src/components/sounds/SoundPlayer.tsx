import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, Heart, Share2, Camera, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useSound, useAudioPlayer, useTrackSoundPlay } from '@/hooks/useSounds';
import { WaveformVisualizer } from './WaveformVisualizer';
import { cn } from '@/lib/utils';

interface SoundPlayerProps {
  soundId: string;
  onClose: () => void;
  onUse: (soundId: string) => void;
  className?: string;
}

export function SoundPlayer({ soundId, onClose, onUse, className }: SoundPlayerProps) {
  const { data: sound } = useSound(soundId);
  const trackPlay = useTrackSoundPlay();
  const audioPlayer = useAudioPlayer(sound?.audio_url || '');
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  // Track play events
  useEffect(() => {
    if (audioPlayer.isPlaying && sound) {
      trackPlay(sound.sound_id, 'player');
    }
  }, [audioPlayer.isPlaying, sound, trackPlay]);

  if (!sound) return null;

  const progress = audioPlayer.duration > 0 ? (audioPlayer.currentTime / audioPlayer.duration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value: number[]) => {
    const time = (value[0] / 100) * audioPlayer.duration;
    audioPlayer.seek(time);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          "fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto",
          className
        )}
      >
        <Card className="p-4 bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
          <div className="flex items-start gap-3">
            {/* Cover Art */}
            <div className="relative">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-red-500/20 overflow-hidden">
                {sound.cover_url ? (
                  <img
                    src={sound.cover_url}
                    alt={sound.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Volume2 className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Playing indicator */}
              {audioPlayer.isPlaying && (
                <motion.div
                  className="absolute inset-0 border-2 border-primary rounded-lg"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </div>

            {/* Info & Controls */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm line-clamp-1">{sound.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{sound.artist}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-6 w-6 shrink-0 ml-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Waveform or Progress */}
              <div className="mb-3">
                {sound.waveform_data ? (
                  <WaveformVisualizer
                    waveformData={sound.waveform_data}
                    isPlaying={audioPlayer.isPlaying}
                    progress={progress}
                    duration={audioPlayer.duration}
                    height={32}
                    onSeek={(percentage) => {
                      const time = (percentage / 100) * audioPlayer.duration;
                      audioPlayer.seek(time);
                    }}
                  />
                ) : (
                  <div className="space-y-1">
                    <Slider
                      value={[progress]}
                      max={100}
                      step={0.1}
                      onValueChange={handleSeek}
                      className="cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatTime(audioPlayer.currentTime)}</span>
                      <span>{formatTime(audioPlayer.duration)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={audioPlayer.toggle}
                    className="h-8 w-8"
                  >
                    {audioPlayer.isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 ml-0.5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMuted(!isMuted)}
                    className="h-8 w-8"
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>

                  {sound.trend_score > 50 && (
                    <Badge variant="destructive" className="text-xs px-2 py-0">
                      Trending
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <Heart className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => onUse(soundId)}
                    className="ml-2"
                  >
                    <Camera className="h-3 w-3 mr-1" />
                    Use
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}