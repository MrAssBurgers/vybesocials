import { motion } from 'framer-motion';
import { Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateCallRoom } from '@/hooks/useCreateCallRoom';

interface CallButtonsProps {
  conversationId: string;
}

export function CallButtons({ conversationId }: CallButtonsProps) {
  const { createRoomAndOpen, isLoading } = useCreateCallRoom();

  const handleAudioCall = () => {
    createRoomAndOpen({
      callType: 'audio',
      conversationId,
    });
  };

  const handleVideoCall = () => {
    createRoomAndOpen({
      callType: 'video',
      conversationId,
    });
  };

  return (
    <div className="flex items-center gap-1">
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAudioCall}
          disabled={isLoading}
          title="Audio call"
        >
          <Phone className="h-5 w-5" />
        </Button>
      </motion.div>
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleVideoCall}
          disabled={isLoading}
          title="Video call"
        >
          <Video className="h-5 w-5" />
        </Button>
      </motion.div>
    </div>
  );
}
