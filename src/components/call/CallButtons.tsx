/**
 * Call Buttons for Chat Header
 * 
 * Simple buttons to start audio/video calls using the global call store.
 * Pre-warms camera on hover for instant FaceTime-like video startup.
 * Supports both 1:1 and group calls.
 */

import { useState, useCallback, useRef } from 'react';
import { Phone, Video, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallStore, CallType } from '@/lib/callStore';
import { toast } from 'sonner';
import { requestCallMediaPermissions } from '@/lib/mediaPermissions';
import { preloadCameraStream } from '@/hooks/useCameraPreload';

interface CallButtonsProps {
  conversationId: string;
  receiverId: string;
  // Group call support
  isGroupCall?: boolean;
  groupName?: string;
  groupAvatar?: string | null;
  participantIds?: string[];
}

export function CallButtons({ 
  conversationId, 
  receiverId,
  isGroupCall,
  groupName,
  groupAvatar,
  participantIds,
}: CallButtonsProps) {
  const { state, startCall } = useCallStore();
  const [isStarting, setIsStarting] = useState<CallType | null>(null);

  // Prevent iOS double-fire (touch -> click) starting two calls.
  const startGuardRef = useRef(false);

  // Pre-warm camera on hover/focus for instant video
  const handleVideoButtonHover = useCallback(() => {
    // Start preloading camera in background
    preloadCameraStream();
  }, []);

  const handleStartCall = useCallback(async (callType: CallType) => {
    if (startGuardRef.current) return;

    if (state.phase !== 'idle') {
      toast.error('Already in a call');
      return;
    }

    startGuardRef.current = true;
    setIsStarting(callType);

    try {
      // For video calls, camera may already be preloaded from hover
      // Request permissions (will be fast if already granted)
      await requestCallMediaPermissions(callType);

      // Start the call with group info if applicable
      await startCall({
        callType,
        conversationId,
        receiverId,
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
  }, [state.phase, startCall, conversationId, receiverId, isGroupCall, groupName, groupAvatar, participantIds]);

  const isDisabled = state.phase !== 'idle' || isStarting !== null;

  // Handle touch for iOS/iPad (some Safari builds don't reliably fire click)
  const handleTouchStart = (callType: CallType) => (e: React.TouchEvent) => {
    e.preventDefault();
    handleStartCall(callType);
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleStartCall('audio')}
        onTouchEnd={handleTouchStart('audio')}
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
        onTouchEnd={handleTouchStart('video')}
        onMouseEnter={handleVideoButtonHover}
        onFocus={handleVideoButtonHover}
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
