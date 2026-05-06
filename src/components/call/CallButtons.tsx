/**
 * Call Buttons for Chat Header
 * 
 * Simple buttons to start audio/video calls using the global call store.
 * Shows a green "Join Back" button when there's a lingering call for this conversation.
 * Supports both 1:1 and group calls.
 * 
 * Calls default to P2P mode (free). Premium users can upgrade to
 * persistent mode via the "Stay On Call" toggle during the call.
 * "Join Back" only appears for persistent mode calls (P2P has no rejoin).
 */

import { useState, useCallback, useRef, useEffect, forwardRef } from 'react';
import { Phone, Video, Loader2, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallStore, CallType, getLingeringCall, subscribeLingeringCall } from '@/lib/callStore';
import { toast } from 'sonner';


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

export const CallButtons = forwardRef<HTMLDivElement, CallButtonsProps>(function CallButtons({ 
  conversationId, 
  receiverId,
  receiverUsername,
  receiverDisplayName,
  receiverAvatarUrl,
  isGroupCall,
  groupName,
  groupAvatar,
  participantIds,
}, ref) {
  const { state, startCall, rejoinCall } = useCallStore();
  const [isStarting, setIsStarting] = useState<CallType | null>(null);

  // Prevent iOS double-fire (touch -> click) starting two calls.
  const startGuardRef = useRef(false);

  // Re-render when the lingering call changes (so Rejoin disappears the moment the call truly ends).
  const [lingeringTick, setLingeringTick] = useState(0);
  useEffect(() => subscribeLingeringCall(() => setLingeringTick(t => t + 1)), []);
  const lingeringCall = getLingeringCall();
  void lingeringTick;
  const hasLingeringCall = lingeringCall?.conversationId === conversationId && lingeringCall?.callMode === 'persistent';

  const handleStartCall = useCallback(async (callType: CallType) => {
    if (startGuardRef.current) return;

    if (state.phase !== 'idle') {
      toast.error('Already in a call');
      return;
    }

    startGuardRef.current = true;
    setIsStarting(callType);

    try {
      // On native (Despia/Capacitor) Android WebView, ensure OS-level mic/camera
      // permission is granted *before* getUserMedia runs. Skipping this caused
      // the WebView to hard-crash mid-permission-prompt on Play Store builds.
      try {
        const ua = navigator.userAgent || '';
        const isNative = /despia|vybeapp|; wv\)|\bwv\b/i.test(ua) || (window as any).Capacitor?.isNativePlatform?.();
        if (isNative) {
          const bridge = (window as any).despia;
          if (bridge?.requestPermission) {
            await bridge.requestPermission('microphone').catch(() => {});
            if (callType === 'video') await bridge.requestPermission('camera').catch(() => {});
          }
        }
      } catch {}

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

  // Show green "Join Back" button when there's a lingering persistent call
  if (hasLingeringCall) {
    return (
      <div ref={ref} className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="default"
          size="sm"
          onClick={handleRejoin}
          className="bg-green-500 hover:bg-green-600 text-white gap-1.5 active:scale-95 transition-transform touch-manipulation h-9 px-3"
        >
          <PhoneCall className="h-4 w-4" />
          <span className="text-sm font-medium">Rejoin</span>
        </Button>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleStartCall('audio')}
        // pointer-events-auto + touch-manipulation defeats Android's 300ms
        // tap-to-zoom delay that was eating the very first tap on small phones.
        onTouchEnd={(e) => { e.preventDefault(); handleStartCall('audio'); }}
        disabled={isDisabled}
        title={isGroupCall ? "Group audio call" : "Audio call"}
        className="h-9 w-9 sm:h-10 sm:w-10 active:scale-95 transition-transform touch-manipulation flex-shrink-0"
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
        onTouchEnd={(e) => { e.preventDefault(); handleStartCall('video'); }}
        disabled={isDisabled}
        title={isGroupCall ? "Group FaceTime" : "FaceTime"}
        className="h-9 w-9 sm:h-10 sm:w-10 active:scale-95 transition-transform touch-manipulation flex-shrink-0"
      >
        {isStarting === 'video' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Video className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
});
