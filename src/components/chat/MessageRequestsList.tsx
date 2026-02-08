import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, 
  Check, 
  X, 
  AlertCircle,
  Inbox
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  useMessageRequests, 
  useRespondToMessageRequest,
  MessageRequest 
} from '@/hooks/useMessageRequests';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const RequestCard = memo(function RequestCard({ 
  request,
  onRespond,
}: { 
  request: MessageRequest;
  onRespond: (action: 'accepted' | 'declined' | 'ignored') => void;
}) {
  const navigate = useNavigate();
  const [isResponding, setIsResponding] = useState(false);

  const handleAccept = async () => {
    setIsResponding(true);
    triggerHaptic('medium');
    
    try {
      // Create DM conversation
      const { data: convId, error } = await supabase
        .rpc('create_dm_conversation', { other_profile_id: request.sender_id });
      
      if (error) throw error;
      
      onRespond('accepted');
      
      // Navigate to the new conversation
      if (convId) {
        navigate(`/messages/${convId}`);
      }
    } catch (error) {
      console.error('Failed to accept request:', error);
      toast.error('Failed to accept request');
    } finally {
      setIsResponding(false);
    }
  };

  const handleDecline = () => {
    triggerHaptic('light');
    onRespond('declined');
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={cn(
        "p-4 rounded-xl",
        "liquid-glass-card border border-border/50"
      )}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(`/u/${request.sender?.username}`)}
          className="flex-shrink-0"
        >
          <Avatar className="h-12 w-12">
            <AvatarImage src={request.sender?.avatar_url || undefined} />
            <AvatarFallback>
              {request.sender?.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/u/${request.sender?.username}`)}
              className="font-medium hover:text-primary transition-colors"
            >
              {request.sender?.username}
            </button>
            {request.sender?.is_verified && (
              <Badge variant="secondary" className="text-[10px]">Verified</Badge>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
          </p>
          
          {request.message_preview && (
            <p className="text-sm mt-2 line-clamp-2 text-muted-foreground">
              "{request.message_preview}"
            </p>
          )}
        </div>
      </div>
      
      <div className="flex gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDecline}
          disabled={isResponding}
          className="flex-1"
        >
          <X className="h-4 w-4 mr-1" />
          Decline
        </Button>
        <Button
          size="sm"
          onClick={handleAccept}
          disabled={isResponding}
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-1" />
          Accept
        </Button>
      </div>
    </motion.div>
  );
});

export const MessageRequestsList = memo(function MessageRequestsList() {
  const { data: requests, isLoading } = useMessageRequests();
  const respondMutation = useRespondToMessageRequest();

  const handleRespond = async (requestId: string, action: 'accepted' | 'declined' | 'ignored') => {
    try {
      await respondMutation.mutateAsync({ requestId, action });
      
      if (action === 'declined') {
        toast.success('Request declined');
      }
    } catch (error) {
      console.error('Failed to respond:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="text-center py-12">
        <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold mb-2">No message requests</h3>
        <p className="text-sm text-muted-foreground">
          When someone new wants to message you, you'll see their request here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          These people want to message you but aren't friends yet
        </p>
      </div>
      
      <AnimatePresence mode="popLayout">
        {requests.map(request => (
          <RequestCard
            key={request.id}
            request={request}
            onRespond={(action) => handleRespond(request.id, action)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});

// Compact badge for showing in conversation list
export const MessageRequestsBadge = memo(function MessageRequestsBadge({ 
  count 
}: { 
  count: number 
}) {
  const navigate = useNavigate();
  
  if (count === 0) return null;
  
  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      onClick={() => navigate('/messages/requests')}
      className={cn(
        "flex items-center gap-2 w-full p-3 rounded-xl",
        "bg-primary/10 border border-primary/20",
        "hover:bg-primary/20 transition-colors"
      )}
    >
      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
        <MessageCircle className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 text-left">
        <p className="font-medium text-sm">Message Requests</p>
        <p className="text-xs text-muted-foreground">
          {count} pending request{count !== 1 ? 's' : ''}
        </p>
      </div>
      <Badge>{count}</Badge>
    </motion.button>
  );
});
