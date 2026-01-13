/**
 * Call Buttons for Chat Header
 * 
 * Simple buttons to start audio/video calls using the global call store.
 */

import { useState, useCallback, useRef } from 'react';
import { Phone, Video, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallStore, CallType } from '@/lib/callStore';
import { toast } from 'sonner';
import { requestCallMediaPermissions } from '@/lib/mediaPermissions';

interface CallButtonsProps {
  conversationId: string;
  receiverId: string;
}

export function CallButtons({ conversationId, receiverId }: CallButtonsProps) {
  const { state, startCall } = useCallStore();
  const [isStarting, setIsStarting] = useState<CallType | null>(null);

  // Prevent iOS double-fire (touch -> click) starting two calls.
  const startGuardRef = useRef(false);

  const handleStartCall = useCallback(async (callType: CallType) => {
    if (startGuardRef.current) return;

    if (state.phase !== 'idle') {
      toast.error('Already in a call');
      return;
    }

    startGuardRef.current = true;
    setIsStarting(callType);

    try {
      // Request permissions first
      await requestCallMediaPermissions(callType);

      // Start the call
      await startCall({
        callType,
        conversationId,
        receiverId,
      });
    } catch (error: any) {
      console.error('[CallButtons] Failed to start call:', error);
      toast.error(error.message || 'Failed to start call');
    } finally {
      startGuardRef.current = false;
      setIsStarting(null);
    }
  }, [state.phase, startCall, conversationId, receiverId]);

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
        title="Audio call"
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
        disabled={isDisabled}
        title="Video call"
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
