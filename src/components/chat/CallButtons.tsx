import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInitiateCall, Call, CallType } from '@/hooks/useCalls';
import { toast } from 'sonner';

interface CallButtonsProps {
  conversationId: string;
  receiverId: string;
  onCallStarted: (call: Call) => void;
}

export function CallButtons({ conversationId, receiverId, onCallStarted }: CallButtonsProps) {
  const [isStarting, setIsStarting] = useState(false);
  const initiateCall = useInitiateCall();

  const handleStartCall = async (callType: CallType) => {
    setIsStarting(true);
    try {
      // Request permissions first
      const constraints = {
        audio: true,
        video: callType === 'video',
      };
      
      try {
        await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        toast.error(`Please allow ${callType === 'video' ? 'camera and microphone' : 'microphone'} access`);
        setIsStarting(false);
        return;
      }

      const call = await initiateCall.mutateAsync({
        conversationId,
        receiverId,
        callType,
      });

      onCallStarted(call);
    } catch (error: any) {
      toast.error(error.message || 'Failed to start call');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleStartCall('audio')}
          disabled={isStarting}
          title="Audio call"
        >
          <Phone className="h-5 w-5" />
        </Button>
      </motion.div>
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleStartCall('video')}
          disabled={isStarting}
          title="Video call"
        >
          <Video className="h-5 w-5" />
        </Button>
      </motion.div>
    </div>
  );
}
