import { useEffect } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Call, useRespondToCall } from '@/hooks/useCalls';

interface IncomingCallDialogProps {
  call: Call;
  onAccept: (call: Call) => void;
  onDecline: () => void;
}

export function IncomingCallDialog({ call, onAccept, onDecline }: IncomingCallDialogProps) {
  const respondToCall = useRespondToCall();

  const handleAccept = async () => {
    await respondToCall.mutateAsync({ callId: call.id, response: 'accepted' });
    onAccept(call);
  };

  const handleDecline = async () => {
    await respondToCall.mutateAsync({ callId: call.id, response: 'declined' });
    onDecline();
  };

  // Auto-decline after 30 seconds (like Instagram)
  useEffect(() => {
    const timeout = setTimeout(() => {
      handleDecline();
    }, 30000);

    return () => clearTimeout(timeout);
  }, []);

  const isVideoCall = call.call_type === 'video';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        {/* Avatar */}
        <div className="relative inline-block mb-6">
          <Avatar className="h-24 w-24 ring-4 ring-primary/30">
            <AvatarImage src={call.caller?.avatar_url || undefined} />
            <AvatarFallback className="text-2xl">
              {call.caller?.display_name?.charAt(0) || call.caller?.username?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 z-20 bg-primary rounded-full p-2">
            {isVideoCall ? (
              <Video className="h-4 w-4 text-primary-foreground" />
            ) : (
              <Phone className="h-4 w-4 text-primary-foreground" />
            )}
          </div>
        </div>

        <h2 className="text-xl font-semibold mb-1">
          {call.caller?.display_name || call.caller?.username}
        </h2>
        <p className="text-muted-foreground mb-8">
          Incoming {isVideoCall ? 'video' : 'audio'} call...
        </p>

        <div className="flex items-center justify-center gap-6">
          <Button
            variant="destructive"
            size="icon"
            className="h-16 w-16 rounded-full"
            onClick={handleDecline}
            disabled={respondToCall.isPending}
          >
            <PhoneOff className="h-7 w-7" />
          </Button>

          <Button
            size="icon"
            className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600"
            onClick={handleAccept}
            disabled={respondToCall.isPending}
          >
            {isVideoCall ? (
              <Video className="h-7 w-7" />
            ) : (
              <Phone className="h-7 w-7" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
