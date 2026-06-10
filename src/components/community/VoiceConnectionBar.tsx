import { memo } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Volume2, Signal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCommunityVoiceContext } from '@/contexts/CommunityVoiceContext';
import { triggerHaptic } from '@/lib/haptics';

export const VoiceConnectionBar = memo(function VoiceConnectionBar() {
  const voice = useCommunityVoiceContext();

  if (!voice.isConnected || !voice.connection) return null;

  const { channelName } = voice.connection;

  return (
    <div className="community-voice-bar shrink-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-9 w-9 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
          <Signal className="h-4 w-4 text-green-400 animate-pulse" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">Voice Connected</p>
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {channelName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'h-9 w-9 rounded-lg community-voice-bar-btn',
            voice.micEnabled && !voice.deafened && 'text-green-400',
          )}
          onClick={() => {
            triggerHaptic('light');
            void voice.toggleMic();
          }}
          aria-label={voice.micEnabled ? 'Mute' : 'Unmute'}
        >
          {voice.micEnabled && !voice.deafened ? (
            <Mic className="h-4 w-4" />
          ) : (
            <MicOff className="h-4 w-4" />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className={cn('h-9 w-9 rounded-lg community-voice-bar-btn', voice.deafened && 'text-destructive')}
          onClick={() => {
            triggerHaptic('light');
            void voice.setDeafened(!voice.deafened);
          }}
          aria-label={voice.deafened ? 'Undeafen' : 'Deafen'}
        >
          {voice.deafened ? (
            <HeadphoneOff className="h-4 w-4" />
          ) : (
            <Headphones className="h-4 w-4" />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-lg community-voice-bar-btn text-destructive hover:bg-destructive/15"
          onClick={() => {
            triggerHaptic('medium');
            void voice.disconnect();
          }}
          aria-label="Disconnect voice"
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
