import { useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useSpace, useSpaceParticipants, useJoinSpace, useLeaveSpace, useEndSpace, useUpdateParticipantRole, useSetSpaceMute, useRaiseHand } from '@/hooks/useSpaces';
import { useSpaceAudio } from '@/hooks/useSpaceAudio';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Mic, MicOff, ArrowLeft, Users, Hand, X, LogOut, Crown, UserPlus, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';

export default function SpaceRoom() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: space, isLoading } = useSpace(spaceId);
  const { data: participants = [] } = useSpaceParticipants(spaceId);
  const joinSpace = useJoinSpace();
  const leaveSpace = useLeaveSpace();
  const endSpace = useEndSpace();
  const updateRole = useUpdateParticipantRole();
  const setSpaceMute = useSetSpaceMute();
  const raiseHand = useRaiseHand();
  const audio = useSpaceAudio();

  const myParticipation = participants.find(p => p.user_id === user?.id);
  const isHost = space?.host_id === user?.id;
  const isSpeaker = myParticipation?.role === 'speaker' || myParticipation?.role === 'host' || myParticipation?.role === 'co_host';
  const isInSpace = !!myParticipation;
  const isMuted = !audio.micEnabled;
  const handRaised = myParticipation?.role === 'requested' || !!myParticipation?.raised_hand;

  const speakers = participants.filter(p => ['host', 'co_host', 'speaker'].includes(p.role));
  const listeners = participants.filter(p => p.role === 'listener');
  const requests = participants.filter(p => p.role === 'requested');

  // Auto-join on mount
  useEffect(() => {
    if (spaceId && user?.id && !isInSpace && space?.status === 'live') {
      joinSpace.mutate({ spaceId });
    }
  }, [spaceId, user?.id, isInSpace, space?.status]);

  // Connect LiveKit audio once participating; reconnects when role changes
  // (e.g. promoted listener → speaker gets a publish-capable token).
  const prevRoleRef = useRef<string | null>(null);
  useEffect(() => {
    const role = myParticipation?.role;
    if (!spaceId || !role || space?.status !== 'live') return;
    if (prevRoleRef.current && prevRoleRef.current !== role && ['speaker', 'co_host'].includes(role)) {
      toast.success("You're a speaker now! Unmute to talk 🎙️");
    }
    prevRoleRef.current = role;
    void audio.connect(spaceId, role);
  }, [spaceId, myParticipation?.role, space?.status]);

  // Host ended the space while we were in it — kill audio
  useEffect(() => {
    if (space?.status === 'ended') {
      void audio.disconnect();
    }
  }, [space?.status]);

  const handleLeave = useCallback(async () => {
    if (!spaceId) return;
    triggerHaptic('medium');
    await audio.disconnect();
    await leaveSpace.mutateAsync(spaceId);
    navigate('/spaces');
  }, [spaceId, leaveSpace, navigate, audio]);

  const handleEnd = useCallback(async () => {
    if (!spaceId) return;
    triggerHaptic('heavy');
    await audio.disconnect();
    await endSpace.mutateAsync(spaceId);
    toast.success('Space ended');
    navigate('/spaces');
  }, [spaceId, endSpace, navigate, audio]);

  const handleRaiseHand = useCallback(() => {
    if (!spaceId) return;
    triggerHaptic('light');
    const next = !handRaised;
    raiseHand.mutate({ spaceId, raised: next });
    toast.info(next ? 'Hand raised! The host will see your request.' : 'Hand lowered');
  }, [spaceId, handRaised, raiseHand]);

  const handleToggleMute = useCallback(async () => {
    if (!spaceId) return;
    triggerHaptic('light');
    const nextEnabled = isMuted; // currently muted → enable mic
    const ok = await audio.setMic(nextEnabled);
    if (!ok) {
      toast.error(nextEnabled ? 'Could not unmute — check mic permission' : 'Could not mute');
      return;
    }
    setSpaceMute.mutate({ spaceId, isMuted: !nextEnabled });
  }, [spaceId, isMuted, audio, setSpaceMute]);

  const handlePromoteToSpeaker = useCallback(async (participantId: string) => {
    if (!spaceId) return;
    await updateRole.mutateAsync({ participantId, spaceId, role: 'speaker' });
    toast.success('Promoted to speaker!');
  }, [spaceId, updateRole]);

  if (isLoading) {
    return (
      <AppLayout hideNav>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-pulse text-muted-foreground">Loading space...</div>
        </div>
      </AppLayout>
    );
  }

  if (!space) {
    return (
      <AppLayout hideNav>
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <p className="text-muted-foreground">Space not found</p>
          <Button onClick={() => navigate('/spaces')}>Back to Spaces</Button>
        </div>
      </AppLayout>
    );
  }

  if (space.status === 'ended') {
    return (
      <AppLayout hideNav>
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <Radio className="h-16 w-16 text-muted-foreground/30" />
          <p className="text-muted-foreground">This space has ended</p>
          <Button onClick={() => navigate('/spaces')}>Back to Spaces</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideNav noPadding>
      <div className="flex flex-col h-full bg-gradient-to-b from-background via-background to-card/30">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <Button variant="ghost" size="icon" onClick={handleLeave}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="text-center">
            <Badge variant="destructive" className="text-xs animate-pulse mb-1">
              <Radio className="h-3 w-3 mr-1" /> LIVE
            </Badge>
            <h1 className="font-bold text-lg">{space.title}</h1>
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground mt-0.5">
              {audio.state === 'connecting' && (
                <><Loader2 className="h-3 w-3 animate-spin" /> Connecting audio…</>
              )}
              {audio.state === 'connected' && (
                <><Volume2 className="h-3 w-3 text-green-500" /> Live audio</>
              )}
              {audio.state === 'error' && (
                <button
                  className="text-destructive underline"
                  onClick={() => myParticipation && spaceId && audio.connect(spaceId, myParticipation.role)}
                >
                  Audio failed — tap to retry
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {participants.length}
          </div>
        </div>

        {/* Speakers grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Speakers
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {speakers.map(speaker => (
              <motion.div
                key={speaker.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center"
              >
                <div className={cn(
                  "relative rounded-full p-1 transition-all",
                  audio.activeSpeakerIds.has(speaker.user_id) && "ring-2 ring-primary"
                )}>
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={speaker.profile?.avatar_url || undefined} />
                    <AvatarFallback>{speaker.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {speaker.role === 'host' && (
                    <Crown className="absolute -top-1 -right-1 h-5 w-5 text-yellow-500" />
                  )}
                  {speaker.is_muted && (
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-destructive flex items-center justify-center">
                      <MicOff className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-xs mt-1.5 truncate max-w-full">
                  {speaker.profile?.display_name || speaker.profile?.username}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Listeners */}
          {listeners.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Listeners ({listeners.length})
              </h3>
              <div className="flex flex-wrap gap-2 mb-6">
                {listeners.slice(0, 20).map(listener => (
                  <motion.div
                    key={listener.id}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={listener.profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {listener.profile?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                ))}
                {listeners.length > 20 && (
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs">
                    +{listeners.length - 20}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Requests (host only) */}
          {isHost && requests.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Requests to Speak ({requests.length})
              </h3>
              <div className="space-y-2">
                {requests.map(req => (
                  <div key={req.id} className="flex items-center gap-3 p-2 rounded-xl bg-card/50 border border-border/50">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={req.profile?.avatar_url || undefined} />
                      <AvatarFallback>{req.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-sm">{req.profile?.username}</span>
                    <Button size="sm" variant="ghost" onClick={() => handlePromoteToSpeaker(req.id)}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bottom controls */}
        <div className="p-4 border-t border-border/50 bg-card/50 backdrop-blur-lg">
          <div className="flex items-center justify-center gap-4">
            {!isSpeaker && (
              <Button
                variant={handRaised ? 'default' : 'outline'}
                size="lg"
                className="rounded-full gap-2"
                onClick={handleRaiseHand}
              >
                <Hand className={cn("h-5 w-5", handRaised && "animate-bounce")} />
                {handRaised ? 'Lower Hand' : 'Raise Hand'}
              </Button>
            )}
            
            {isSpeaker && (
              <Button
                variant={isMuted ? 'destructive' : 'default'}
                size="lg"
                className="rounded-full h-14 w-14"
                onClick={handleToggleMute}
              >
                {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>
            )}
            
            <Button
              variant="outline"
              size="lg"
              className="rounded-full gap-2"
              onClick={handleLeave}
            >
              <LogOut className="h-5 w-5" />
              Leave
            </Button>
            
            {isHost && (
              <Button
                variant="destructive"
                size="lg"
                className="rounded-full gap-2"
                onClick={handleEnd}
              >
                <X className="h-5 w-5" />
                End
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
