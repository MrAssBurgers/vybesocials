import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  Headphones,
  HeadphoneOff,
  PhoneOff,
  Loader2,
  Radio,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCommunityVoiceContext } from '@/contexts/CommunityVoiceContext';
import { useCommunityMembers } from '@/hooks/useCommunities';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { triggerHaptic } from '@/lib/haptics';

interface VoiceChannelViewProps {
  channelId: string;
  channelName: string;
  communityId: string;
}

function ParticipantTile({
  name,
  avatarUrl,
  isSpeaking,
  isMuted,
  isLocal,
}: {
  name: string;
  avatarUrl?: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isLocal: boolean;
}) {
  const signedAvatar = useSignedUrl(avatarUrl);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'community-voice-tile',
        isSpeaking && 'community-voice-tile--speaking',
      )}
    >
      <div className="relative">
        <Avatar className={cn('h-16 w-16 ring-2', isSpeaking ? 'ring-green-400' : 'ring-foreground/10')}>
          {signedAvatar ? <AvatarImage src={signedAvatar} alt={name} /> : null}
          <AvatarFallback className="text-lg font-semibold">
            {name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {isMuted && (
          <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-destructive flex items-center justify-center border-2 border-background">
            <MicOff className="h-3 w-3 text-destructive-foreground" />
          </span>
        )}
      </div>
      <p className="text-sm font-medium truncate max-w-[120px] text-center mt-2">
        {isLocal ? 'You' : name}
      </p>
    </motion.div>
  );
}

export const VoiceChannelView = memo(function VoiceChannelView({
  channelId,
  channelName,
  communityId,
}: VoiceChannelViewProps) {
  const voice = useCommunityVoiceContext();
  const { data: members = [] } = useCommunityMembers(communityId);

  const profileByUserId = useMemo(() => {
    const map = new Map<string, { name: string; avatar?: string | null }>();
    members.forEach((m) => {
      map.set(m.user_id, {
        name: m.profile?.display_name || m.profile?.username || 'Member',
        avatar: m.profile?.avatar_url,
      });
    });
    return map;
  }, [members]);

  const tiles = voice.participants.map((p) => {
    const profile = profileByUserId.get(p.identity);
    return {
      ...p,
      displayName: p.isLocal ? 'You' : profile?.name || p.name,
      avatar: profile?.avatar,
    };
  });

  const isThisChannel =
    voice.connection?.channelId === channelId && voice.connection?.serverId === communityId;

  return (
    <div className="community-voice-view flex flex-col h-full">
      <div className="community-voice-header px-4 py-3 border-b border-foreground/8 flex items-center gap-3 shrink-0">
        <div className="h-9 w-9 rounded-xl bg-green-500/15 flex items-center justify-center">
          <Volume2 className="h-4 w-4 text-green-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold truncate">{channelName}</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            {voice.state === 'connecting' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Connecting…
              </>
            ) : isThisChannel ? (
              <>
                <Radio className="h-3 w-3 text-green-400 animate-pulse" />
                Voice Connected · {tiles.length} in channel
              </>
            ) : (
              'Select to join voice'
            )}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {voice.state === 'connecting' && tiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Joining voice channel…</p>
          </div>
        ) : tiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <div className="h-20 w-20 rounded-3xl community-voice-empty-icon flex items-center justify-center mb-2">
              <Volume2 className="h-9 w-9 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Nobody here yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              You&apos;re connected — friends will appear here when they join {channelName}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 justify-items-center">
            {tiles.map((p) => (
              <ParticipantTile
                key={p.identity}
                name={p.displayName}
                avatarUrl={p.avatar}
                isSpeaking={p.isSpeaking}
                isMuted={p.isMuted}
                isLocal={p.isLocal}
              />
            ))}
          </div>
        )}

        {voice.error && (
          <p className="text-sm text-destructive text-center mt-4">{voice.error}</p>
        )}
      </div>

      {isThisChannel && (
        <div className="community-voice-controls px-4 py-4 border-t border-foreground/8 shrink-0">
          <div className="flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant={voice.micEnabled && !voice.deafened ? 'default' : 'secondary'}
              className={cn(
                'rounded-full h-12 w-12 p-0',
                voice.micEnabled && !voice.deafened && 'shadow-[0_0_20px_hsl(var(--primary)/0.45)]',
              )}
              onClick={() => {
                triggerHaptic('light');
                void voice.toggleMic();
              }}
              disabled={voice.state !== 'connected'}
            >
              {voice.micEnabled && !voice.deafened ? (
                <Mic className="h-5 w-5" />
              ) : (
                <MicOff className="h-5 w-5" />
              )}
            </Button>

            <Button
              size="lg"
              variant={voice.deafened ? 'destructive' : 'secondary'}
              className="rounded-full h-12 w-12 p-0"
              onClick={() => {
                triggerHaptic('light');
                void voice.setDeafened(!voice.deafened);
              }}
              disabled={voice.state !== 'connected'}
            >
              {voice.deafened ? (
                <HeadphoneOff className="h-5 w-5" />
              ) : (
                <Headphones className="h-5 w-5" />
              )}
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="rounded-full h-12 px-5 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => {
                triggerHaptic('medium');
                void voice.disconnect();
              }}
            >
              <PhoneOff className="h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
