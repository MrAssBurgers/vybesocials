/**
 * Call Buttons for Chat Header
 * 
 * Simple buttons to start audio/video calls using the global call store.
 * Shows a green "Join Back" button when there's a lingering call for this conversation.
 * Supports both 1:1 and group calls.
 */

import { useState, useCallback, useRef } from 'react';
import { Phone, Video, Loader2, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallStore, CallType, getLingeringCall } from '@/lib/callStore';
import { toast } from 'sonner';
import { requestCallMediaPermissions } from '@/lib/mediaPermissions';
// Note: roomUrl removed from CallData — LiveKit uses livekitUrl + token

interface CallButtonsProps {
  conversationId: string;
  receiverId: string;
  receiverUsername?: string;
  receiverDisplayName?: string | null;
  receiverAvatarUrl?: string | null;
  isGroupCall?: boolean;
  groupName?: string;
  groupAvatar?: string | null;
  participantIds?: string[];
}

export function CallButtons({ 
  conversationId, 
  receiverId,
  receiverUsername,
  receiverDisplayName,
  receiverAvatarUrl,
  isGroupCall,
  groupName,
  groupAvatar,
  participantIds,
}: CallButtonsProps) {
  const { state, startCall, rejoinCall } = useCallStore();
  const [isStarting, setIsStarting] = useState<CallType | null>(null);

  // Prevent iOS double-fire (touch -> click) starting two calls.
  const startGuardRef = useRef(false);

  // Check if there's a lingering call for this conversation
  const lingeringCall = getLingeringCall();
  const hasLingeringCall = lingeringCall?.conversationId === conversationId;

  const handleStartCall = useCallback(async (callType: CallType) => {
    if (startGuardRef.current) return;

    if (state.phase !== 'idle') {
      toast.error('Already in a call');
      return;
    }

    startGuardRef.current = true;
    setIsStarting(callType);

    try {
      await requestCallMediaPermissions(callType);
      await startCall({
        callType,
        conversationId,
        receiverId,
        receiverUsername,
        receiverDisplayName,
        receiverAvatarUrl,
        isGroupCall,
        groupName,
        groupAvatar,
        participantIds,
      });
    } catch (error: any) {
      console.error('[CallButtons] Failed to start call:', error);
      toast.error(error.message || 'Failed to start call');
    } finally {
      startGuardRef.current = false;
      setIsStarting(null);
    }
  }, [state.phase, startCall, conversationId, receiverId, receiverUsername, receiverDisplayName, receiverAvatarUrl, isGroupCall, groupName, groupAvatar, participantIds]);

  const handleRejoin = useCallback(async () => {
    await rejoinCall();
  }, [rejoinCall]);

  const isDisabled = state.phase !== 'idle' || isStarting !== null;

  // Show green "Join Back" button when there's a lingering call
  if (hasLingeringCall) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="default"
          size="sm"
          onClick={handleRejoin}
          className="bg-green-500 hover:bg-green-600 text-white gap-1.5 active:scale-95 transition-transform touch-manipulation"
        >
          <PhoneCall className="h-4 w-4" />
          <span className="text-sm font-medium">Join Back</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleStartCall('audio')}
        disabled={isDisabled}
        title={isGroupCall ? "Group audio call" : "Audio call"}
        className="active:scale-95 transition-transform touch-manipulation"
      >
        {isStarting === 'audio' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Phone className="h-5 w-5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleStartCall('video')}
        disabled={isDisabled}
        title={isGroupCall ? "Group FaceTime" : "FaceTime"}
        className="active:scale-95 transition-transform touch-manipulation"
      >
        {isStarting === 'video' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Video className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
