import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateDailyRoom, useSendCallInvite, DailyCall, DailyCallType } from '@/hooks/useDailyCalls';
import { useDailyCallContext } from './DailyCallProvider';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface DailyCallButtonsProps {
  conversationId: string;
  receiverId: string;
}

export function DailyCallButtons({ conversationId, receiverId }: DailyCallButtonsProps) {
  const [isStarting, setIsStarting] = useState(false);
  const createRoom = useCreateDailyRoom();
  const sendInvite = useSendCallInvite();
  const { startCall } = useDailyCallContext();

  const handleStartCall = async (callType: DailyCallType) => {
    setIsStarting(true);
    try {
      // Request permissions first
      const constraints = {
        audio: true,
        video: callType === 'video',
      };
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        // Stop tracks immediately, we just needed to check permission
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        toast.error(`Please allow ${callType === 'video' ? 'camera and microphone' : 'microphone'} access`);
        setIsStarting(false);
        return;
      }

      // Create Daily room via edge function
      const { roomUrl, roomName, callId } = await createRoom.mutateAsync({
        type: callType,
        conversationId,
        participants: [receiverId],
      });

      // Send invite (update status to ringing)
      await sendInvite.mutateAsync({ callId, receiverId });

      // Fetch the full call with profiles
      const { data: call } = await supabase
        .from('calls')
        .select(`
          *,
          caller:profiles!calls_caller_id_fkey(id, username, avatar_url, display_name),
          receiver:profiles!calls_receiver_id_fkey(id, username, avatar_url, display_name)
        `)
        .eq('id', callId)
        .single();

      if (call) {
        startCall(call as DailyCall);
      }
    } catch (error: any) {
      console.error('Failed to start call:', error);
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
