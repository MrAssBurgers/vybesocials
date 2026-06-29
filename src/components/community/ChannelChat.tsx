import { useState, useRef, useEffect, memo, useMemo, useCallback } from 'react';
import { Hash, Send, Loader2, MoreHorizontal, Reply, Copy, Trash2, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ServerSafetyGate } from './ServerSafetyGate';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { useChannelMessages, useSendChannelMessage, ChannelMessage, useMyServerRole } from '@/hooks/useServers';
import { useMyChannelPermissions } from '@/hooks/useChannelPermissions';
import { useAuth } from '@/lib/auth';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';

interface ChannelChatProps {
  channelId: string;
  channelName: string;
  serverId: string;
}

export const ChannelChat = memo(function ChannelChat({ channelId, channelName, serverId }: ChannelChatProps) {
  const { profile } = useAuth();
  const { data: messages = [], isLoading } = useChannelMessages(channelId);
  const sendMessage = useSendChannelMessage();
  const { data: myRole } = useMyServerRole(serverId);
  const { data: myPerms } = useMyChannelPermissions(channelId, serverId);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canSend = myPerms?.can_send !== false;
  const canModerate = myRole === 'owner' || myRole === 'admin' || myRole === 'moderator';

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || sendMessage.isPending) return;

    const text = messageText.trim();
    setMessageText('');

    await sendMessage.mutateAsync({
      channelId,
      content: text,
    });
  }, [messageText, channelId, sendMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: ChannelMessage[] }[] = [];
    let currentDate = '';

    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  }, [messages]);

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d, yyyy');
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header - hidden on mobile since channel is shown in tabs */}
      <div className="hidden sm:flex items-center gap-2 px-4 py-3 border-b border-border">
        <Hash className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">{channelName}</h2>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-2 sm:px-4 vybe-chat-messages">
        <div className="py-3 sm:py-4">
          {groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 my-4 sm:my-5">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] sm:text-[11px] text-muted-foreground/60 font-medium">
                  {formatDateHeader(group.date)}
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              {/* Messages for this date */}
              <div className="flex flex-col">
                {group.messages.map((message, index) => {
                  const prevMessage = index > 0 ? group.messages[index - 1] : null;
                  const showFullHeader = !prevMessage || 
                    prevMessage.sender_id !== message.sender_id ||
                    new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 5 * 60 * 1000;
                  
                  const spacingClass = showFullHeader ? 'pt-3 sm:pt-4' : 'pt-0.5 sm:pt-1';

                  return (
                    <div key={message.id} className={cn(spacingClass, index === 0 && 'pt-0')}>
                      <MessageItem
                        message={message}
                        isOwn={message.sender_id === profile?.id}
                        showFullHeader={showFullHeader}
                        canModerate={canModerate}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center px-4">
              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-muted flex items-center justify-center mb-3 sm:mb-4">
                <Hash className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-1">Welcome to #{channelName}</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">
                This is the start of the channel. Send a message!
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input - mobile optimized with safe area */}
      {canSend ? (
        <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-border bg-background/95 backdrop-blur-sm vybe-chat-composer">
          <div className="flex items-center gap-2">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Message #${channelName}`}
              className="flex-1 h-10 sm:h-10 text-[15px] sm:text-sm"
            />
            <EmojiPicker
              onEmojiSelect={(emoji) => {
                setMessageText(prev => prev + emoji);
              }}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMessage.isPending}
              className="h-10 w-10 flex-shrink-0"
            >
              {sendMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-3 sm:px-4 py-3 border-t border-border bg-muted/30 text-center pb-safe">
          <p className="text-xs text-muted-foreground">You don't have permission to send messages in this channel</p>
        </div>
      )}
    </div>
  );
});

// Message item component
const MessageItem = memo(function MessageItem({
  message,
  isOwn,
  showFullHeader,
  canModerate,
}: {
  message: ChannelMessage;
  isOwn: boolean;
  showFullHeader: boolean;
  canModerate: boolean;
}) {
  const copyToClipboard = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      toast.success('Copied to clipboard');
    }
  };

  return (
    <div className={cn(
      "group flex gap-2 sm:gap-3 hover:bg-muted/20 -mx-1 sm:-mx-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-colors active:bg-muted/30",
      !showFullHeader && "pl-10 sm:pl-14"
    )}>
      {showFullHeader && (
        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 mt-0.5">
          <AvatarImage src={message.sender?.avatar_url || undefined} />
          <AvatarFallback className="text-xs sm:text-sm">
            {(message.sender?.display_name || message.sender?.username)?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex-1 min-w-0">
        {showFullHeader && (
          <div className="flex items-baseline gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <span className="font-semibold text-[13px] sm:text-sm truncate max-w-[150px] sm:max-w-none">
              {message.sender?.display_name || message.sender?.username}
            </span>
            <span className="text-[9px] sm:text-[10px] text-muted-foreground/50 font-light flex-shrink-0">
              {format(new Date(message.created_at), 'h:mm a')}
            </span>
          </div>
        )}

        <div className="flex items-start gap-1 sm:gap-2">
          <p className="text-[13px] sm:text-sm text-foreground break-words flex-1 leading-[1.45] sm:leading-[1.4]">
            {message.content}
            {message.is_edited && (
              <span className="text-[9px] sm:text-[10px] text-muted-foreground/60 ml-1">(edited)</span>
            )}
          </p>

          {/* Actions - always visible on mobile via long press behavior handled by dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 sm:opacity-0 sm:group-hover:opacity-100 opacity-60 transition-opacity flex-shrink-0"
                onPointerDown={(e) => {
                  (e.currentTarget as any)._pointerY = e.clientY;
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const startY = (e.currentTarget as any)._pointerY;
                  if (startY !== undefined && Math.abs(e.clientY - startY) > 8) {
                    e.preventDefault();
                    return;
                  }
                }}
              >
                <MoreHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              <DropdownMenuItem onClick={copyToClipboard} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy
              </DropdownMenuItem>
              {isOwn && (
                <DropdownMenuItem className="gap-2">
                  <Edit3 className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {(isOwn || canModerate) && (
                <DropdownMenuItem className="text-destructive gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Media - with safety gating */}
        {message.media_url && (message.media_type === 'image' || message.media_type === 'video') && (
          <div className="mt-2">
            <ServerSafetyGate
              mediaUrl={message.media_url}
              mediaType={message.media_type}
              className="max-w-[85%] sm:max-w-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
});
