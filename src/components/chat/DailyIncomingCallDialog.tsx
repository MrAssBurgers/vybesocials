import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DailyCall, useAcceptDailyCall, useDeclineDailyCall } from '@/hooks/useDailyCalls';
import { callSounds } from '@/lib/callSounds';

interface DailyIncomingCallDialogProps {
  call: DailyCall;
  onAccept: (call: DailyCall) => void;
  onDecline: () => void;
}

export function DailyIncomingCallDialog({ call, onAccept, onDecline }: DailyIncomingCallDialogProps) {
  const acceptCall = useAcceptDailyCall();
  const declineCall = useDeclineDailyCall();
  const [timeLeft, setTimeLeft] = useState(30);
  const hasResponded = useRef(false);

  // Start ringing sound when dialog appears
  useEffect(() => {
    callSounds.startRinging();
    
    return () => {
      callSounds.stopAll();
    };
  }, []);

  const handleAccept = useCallback(async () => {
    if (hasResponded.current) return;
    hasResponded.current = true;
    callSounds.stopAll();
    
    try {
      const updatedCall = await acceptCall.mutateAsync(call.id);
      onAccept(updatedCall);
    } catch (error) {
      hasResponded.current = false;
    }
  }, [acceptCall, call.id, onAccept]);

  const handleDecline = useCallback(async () => {
    if (hasResponded.current) return;
    hasResponded.current = true;
    callSounds.stopAll();
    callSounds.end();
    
    try {
      await declineCall.mutateAsync(call.id);
      onDecline();
    } catch (error) {
      hasResponded.current = false;
    }
  }, [declineCall, call.id, onDecline]);

  // Countdown timer with auto-decline
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [handleDecline]);

  const isVideoCall = call.call_type === 'video';

  // Ringing pulse effect
  const PulseRings = () => (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-primary"
          initial={{ width: 100, height: 100, opacity: 0.6 }}
          animate={{ 
            width: [100, 200], 
            height: [100, 200], 
            opacity: [0.5, 0] 
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-gradient-to-b from-black/90 via-black/95 to-black flex items-center justify-center p-4"
    >
      {/* Background blur effect */}
      <div className="absolute inset-0 backdrop-blur-xl" />
      
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="relative z-10 flex flex-col items-center max-w-sm w-full"
      >
        {/* Avatar with pulse effect */}
        <div className="relative mb-8">
          <PulseRings />
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          >
            <Avatar className="h-32 w-32 ring-4 ring-primary/30 shadow-2xl shadow-primary/20">
              <AvatarImage src={call.caller?.avatar_url || undefined} />
              <AvatarFallback className="text-4xl font-semibold bg-gradient-to-br from-primary to-primary/50">
                {call.caller?.display_name?.charAt(0) || call.caller?.username?.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          
          {/* Call type badge */}
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary rounded-full px-3 py-1 flex items-center gap-1 shadow-lg"
          >
            {isVideoCall ? (
              <Video className="h-4 w-4 text-primary-foreground" />
            ) : (
              <Phone className="h-4 w-4 text-primary-foreground" />
            )}
            <span className="text-xs font-medium text-primary-foreground">
              {isVideoCall ? 'Video' : 'Audio'}
            </span>
          </motion.div>
        </div>

        {/* Caller info */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-10"
        >
          <h2 className="text-2xl font-semibold text-white mb-2">
            {call.caller?.display_name || call.caller?.username}
          </h2>
          <motion.p 
            className="text-white/70 text-lg"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            Incoming {isVideoCall ? 'video' : 'audio'} call...
          </motion.p>
        </motion.div>

        {/* Answer/Decline buttons */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-10 w-full"
        >
          {/* Decline button */}
          <div className="flex flex-col items-center gap-2">
            <motion.div 
              whileHover={{ scale: 1.1 }} 
              whileTap={{ scale: 0.9 }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
                onClick={handleDecline}
                disabled={acceptCall.isPending || declineCall.isPending}
              >
                <PhoneOff className="h-7 w-7" />
              </Button>
            </motion.div>
            <span className="text-white/60 text-sm">Decline</span>
          </div>

          {/* Accept button */}
          <div className="flex flex-col items-center gap-2">
            <motion.div 
              whileHover={{ scale: 1.1 }} 
              whileTap={{ scale: 0.9 }}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <Button
                size="icon"
                className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30"
                onClick={handleAccept}
                disabled={acceptCall.isPending || declineCall.isPending}
              >
                {isVideoCall ? (
                  <Video className="h-7 w-7" />
                ) : (
                  <Phone className="h-7 w-7" />
                )}
              </Button>
            </motion.div>
            <span className="text-white/60 text-sm">Accept</span>
          </div>
        </motion.div>

        {/* Auto-decline timer */}
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-white/40 text-sm"
        >
          Auto-declining in {timeLeft}s
        </motion.p>

        {/* Encrypted indicator */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 flex items-center gap-2 text-white/40 text-sm"
        >
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span>End-to-end encrypted</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
