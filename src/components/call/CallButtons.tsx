/**
 * Call Buttons for Chat Header
 * 
 * Simple buttons to start audio/video calls using the global call store.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
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

  const handleStartCall = async (callType: CallType) => {
    if (state.phase !== 'idle') {
      toast.error('Already in a call');
      return;
    }

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
      setIsStarting(null);
    }
  };

  const isDisabled = state.phase !== 'idle' || isStarting !== null;

  return (
    <div className="flex items-center gap-1">
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleStartCall('audio')}
          disabled={isDisabled}
          title="Audio call"
        >
          {isStarting === 'audio' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Phone className="h-5 w-5" />
          )}
        </Button>
      </motion.div>
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleStartCall('video')}
          disabled={isDisabled}
          title="Video call"
        >
          {isStarting === 'video' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Video className="h-5 w-5" />
          )}
        </Button>
      </motion.div>
    </div>
  );
}
