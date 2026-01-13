/**
 * Call History Component
 * 
 * Shows call history in DMs:
 * - Missed calls (red)
 * - Incoming calls (received)
 * - Outgoing calls (made)
 * - Timestamped
 * - Tapping does NOT auto-call
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video } from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface CallHistoryProps {
  conversationId: string;
  limit?: number;
}

interface CallRecord {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'audio' | 'video';
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  caller: {
    id: string;
    username: string;
    display_name: string | null;
  };
  receiver: {
    id: string;
    username: string;
    display_name: string | null;
  };
}

function getCallDuration(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt || !endedAt) return null;
  
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const durationMs = end - start;
  
  if (durationMs < 0) return null;
  
  const seconds = Math.floor(durationMs / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatCallTime(dateStr: string): string {
  const date = new Date(dateStr);
  
  if (isToday(date)) {
    return format(date, 'h:mm a');
  }
  
  if (isYesterday(date)) {
    return `Yesterday, ${format(date, 'h:mm a')}`;
  }
  
  return format(date, 'MMM d, h:mm a');
}

export function CallHistory({ conversationId, limit = 10 }: CallHistoryProps) {
  const { profile } = useAuth();

  const { data: calls, isLoading } = useQuery({
    queryKey: ['call-history', conversationId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select(`
          id,
          caller_id,
          receiver_id,
          call_type,
          status,
          started_at,
          ended_at,
          created_at,
          caller:profiles!calls_caller_id_fkey(id, username, display_name),
          receiver:profiles!calls_receiver_id_fkey(id, username, display_name)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as CallRecord[];
    },
    enabled: !!conversationId && !!profile?.id,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2].map(i => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!calls || calls.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1 py-2">
      {calls.map(call => {
        const isOutgoing = call.caller_id === profile?.id;
        const isMissed = call.status === 'missed' || call.status === 'declined';
        const wasAnswered = call.status === 'ended' && call.started_at;
        const duration = getCallDuration(call.started_at, call.ended_at);
        
        const otherPerson = isOutgoing ? call.receiver : call.caller;
        const otherName = otherPerson?.display_name || otherPerson?.username || 'Unknown';

        // Determine icon and color
        let Icon = isOutgoing ? PhoneOutgoing : PhoneIncoming;
        let colorClass = 'text-muted-foreground';
        let label = isOutgoing ? 'Outgoing' : 'Incoming';
        
        if (isMissed) {
          Icon = PhoneMissed;
          colorClass = 'text-red-500';
          label = isOutgoing ? 'No answer' : 'Missed';
        } else if (wasAnswered) {
          colorClass = 'text-emerald-500';
        }

        return (
          <div
            key={call.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg",
              "bg-muted/30 hover:bg-muted/50 transition-colors",
              "cursor-default" // Explicitly not clickable
            )}
          >
            {/* Icon */}
            <div className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full",
              "bg-muted/50"
            )}>
              {call.call_type === 'video' ? (
                <Video className={cn("w-4 h-4", colorClass)} />
              ) : (
                <Icon className={cn("w-4 h-4", colorClass)} />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-medium",
                  isMissed ? "text-red-500" : "text-foreground"
                )}>
                  {label} {call.call_type === 'video' ? 'video' : 'call'}
                </span>
                {duration && (
                  <span className="text-xs text-muted-foreground">
                    {duration}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {formatCallTime(call.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Inline call history item for showing in message list
 */
export function CallHistoryMessage({ call, currentUserId }: { 
  call: CallRecord; 
  currentUserId: string;
}) {
  const isOutgoing = call.caller_id === currentUserId;
  const isMissed = call.status === 'missed' || call.status === 'declined';
  const wasAnswered = call.status === 'ended' && call.started_at;
  const duration = getCallDuration(call.started_at, call.ended_at);

  let Icon = isOutgoing ? PhoneOutgoing : PhoneIncoming;
  let colorClass = 'text-muted-foreground';
  let label = isOutgoing ? 'Outgoing' : 'Incoming';
  
  if (isMissed) {
    Icon = PhoneMissed;
    colorClass = 'text-red-500';
    label = isOutgoing ? 'No answer' : 'Missed';
  } else if (wasAnswered) {
    colorClass = 'text-emerald-500';
  }

  return (
    <div className="flex items-center justify-center gap-2 py-2 px-4">
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full",
        "bg-muted/50 text-muted-foreground text-xs"
      )}>
        {call.call_type === 'video' ? (
          <Video className={cn("w-3.5 h-3.5", colorClass)} />
        ) : (
          <Icon className={cn("w-3.5 h-3.5", colorClass)} />
        )}
        <span className={isMissed ? 'text-red-500' : undefined}>
          {label} {call.call_type === 'video' ? 'video' : 'call'}
        </span>
        {duration && <span>• {duration}</span>}
        <span>• {formatCallTime(call.created_at)}</span>
      </div>
    </div>
  );
}
