import { useState, useRef, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Music2, Scissors, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAudioPlayer } from '@/hooks/useSounds';
import { WaveformVisualizer } from './WaveformVisualizer';
import { Sound } from '@/hooks/useSounds';

interface SoundControlsProps {
  sound: Sound;
  startTime: number;
  onStartTimeChange: (time: number) => void;
  onRemoveSound?: () => void;
  className?: string;
  compact?: boolean;
}

export const SoundControls = memo(function SoundControls({
  sound,
  startTime,
  onStartTimeChange,
  onRemoveSound,
  className,
  compact = false
}: SoundControlsProps) {
  const audioPlayer = useAudioPlayer(sound.preview_url || sound.audio_url, sound.sound_id);

  const maxDuration = Math.min(60, sound.duration); // Max 60 seconds for videos
  const endTime = Math.min(startTime + 30, sound.duration); // 30 second clips

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartTimeChange = useCallback((value: number[]) => {
    const newStartTime = value[0];
    onStartTimeChange(newStartTime);
    
    // Seek to preview the new start time
    if (audioPlayer.isLoaded) {
      audioPlayer.seek(newStartTime);
    }
  }, [onStartTimeChange, audioPlayer]);

  if (compact) {
    return (
      <Card className={cn("p-3", className)}>
        <div className="flex items-center gap-3">
          {/* Play button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={audioPlayer.toggle}
                    aria-label={audioPlayer.isPlaying || audioPlayer.isLoading ? "Pause audio" : "Play audio"}
            className="h-8 w-8 shrink-0"
          >
            {audioPlayer.isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </Button>

          {/* Sound info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium line-clamp-1">{sound.title}</p>
            <p className="text-xs text-muted-foreground line-clamp-1">{sound.artist}</p>
          </div>

          {/* Remove button */}
          {onRemoveSound && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemoveSound}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {audioPlayer.error && <p role="alert" className="text-sm">{audioPlayer.error}</p>}
        {/* Waveform with trim indicator */}
        {sound.waveform_data && (
          <div className="mt-2 relative">
            <WaveformVisualizer
              waveformData={sound.waveform_data}
              isPlaying={audioPlayer.isPlaying}
              progress={audioPlayer.duration > 0 ? (audioPlayer.currentTime / audioPlayer.duration) * 100 : 0}
              duration={audioPlayer.duration}
              height={24}
              onSeek={(percentage) => {
                const time = (percentage / 100) * audioPlayer.duration;
                audioPlayer.seek(time);
              }}
            />
            
            {/* Start time indicator */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-yellow-500 rounded-full z-10"
              style={{ left: `${(startTime / sound.duration) * 100}%` }}
            />
            
            {/* End time indicator */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 rounded-full z-10"
              style={{ left: `${(endTime / sound.duration) * 100}%` }}
            />
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className={cn("p-4", className)}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Cover */}
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-purple-500/10 to-pink-500/10">
              {sound.cover_url ? (
                <img src={sound.cover_url} alt={sound.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music2 className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm line-clamp-1">{sound.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-1">{sound.artist}</p>
              <div className="flex items-center gap-2 mt-1">
                {sound.trend_score > 50 && (
                  <Badge variant="destructive" className="text-xs">Trending</Badge>
                )}
                <span className="text-xs text-muted-foreground">{sound.usage_count} videos</span>
              </div>
            </div>
          </div>

          {onRemoveSound && (
            <Button variant="ghost" size="icon" onClick={onRemoveSound}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Waveform */}
        {sound.waveform_data && (
          <div className="relative">
            <WaveformVisualizer
              waveformData={sound.waveform_data}
              isPlaying={audioPlayer.isPlaying}
              progress={audioPlayer.duration > 0 ? (audioPlayer.currentTime / audioPlayer.duration) * 100 : 0}
              duration={audioPlayer.duration}
              height={48}
              onSeek={(percentage) => {
                const time = (percentage / 100) * audioPlayer.duration;
                audioPlayer.seek(time);
              }}
            />
            
            {/* Selection overlay */}
            <div 
              className="absolute top-0 bottom-0 bg-primary/20 border-l-2 border-r-2 border-primary z-10"
              style={{
                left: `${(startTime / sound.duration) * 100}%`,
                width: `${((endTime - startTime) / sound.duration) * 100}%`
              }}
            />
          </div>
        )}

        {audioPlayer.error && <p role="alert" className="text-sm">{audioPlayer.error}</p>}
              {audioPlayer.isLoading && <p role="status" className="text-sm">Starting audio…</p>}
              {/* Controls */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={audioPlayer.toggle}
                    aria-label={audioPlayer.isPlaying || audioPlayer.isLoading ? "Pause audio" : "Play audio"}
            className="h-10 w-10"
          >
            {audioPlayer.isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label={audioPlayer.isMuted ? "Unmute audio" : "Mute audio"}
                    onClick={() => audioPlayer.setMuted(!audioPlayer.isMuted)}
            className="h-10 w-10"
          >
            {audioPlayer.isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>

          <div className="flex-1 text-xs text-muted-foreground">
            {formatTime(audioPlayer.currentTime)} / {formatTime(audioPlayer.duration)}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Preview controls only. Music is not attached to video exports yet.</p>
        {/* Preview start controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1">
              <Scissors className="h-3 w-3" />
              Preview Start Time
            </span>
            <span className="text-muted-foreground">{formatTime(startTime)}</span>
          </div>

          <Slider
            value={[startTime]}
            max={maxDuration}
            step={0.1}
            onValueChange={handleStartTimeChange}
            className="cursor-pointer"
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Preview: {formatTime(startTime)} - {formatTime(endTime)}</span>
            <span>{formatTime(endTime - startTime)} duration</span>
          </div>
        </div>
      </div>
    </Card>
  );
});