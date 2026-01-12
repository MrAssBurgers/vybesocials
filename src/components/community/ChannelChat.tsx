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
import { useChannelMessages, useSendChannelMessage, ChannelMessage, useMyServerRole } from '@/hooks/useServers';
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
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Hash className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">{channelName}</h2>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="py-4 space-y-4">
          {groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-4 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">
                  {formatDateHeader(group.date)}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Messages for this date */}
              <div className="space-y-3">
                {group.messages.map((message, index) => {
                  const prevMessage = index > 0 ? group.messages[index - 1] : null;
                  const showFullHeader = !prevMessage || 
                    prevMessage.sender_id !== message.sender_id ||
                    new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 5 * 60 * 1000;

                  return (
                    <MessageItem
                      key={message.id}
                      message={message}
                      isOwn={message.sender_id === profile?.id}
                      showFullHeader={showFullHeader}
                      canModerate={canModerate}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Hash className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Welcome to #{channelName}</h3>
              <p className="text-muted-foreground text-sm">
                This is the start of the channel. Send a message!
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2">
          <Input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Message #${channelName}`}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!messageText.trim() || sendMessage.isPending}
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
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
      "group flex gap-3 hover:bg-muted/30 -mx-2 px-2 py-1 rounded-lg transition-colors",
      !showFullHeader && "pl-14"
    )}>
      {showFullHeader && (
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={message.sender?.avatar_url || undefined} />
          <AvatarFallback>
            {(message.sender?.display_name || message.sender?.username)?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex-1 min-w-0">
        {showFullHeader && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm">
              {message.sender?.display_name || message.sender?.username}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(message.created_at), 'h:mm a')}
            </span>
          </div>
        )}

        <div className="flex items-start gap-2">
          <p className="text-sm text-foreground break-words flex-1">
            {message.content}
            {message.is_edited && (
              <span className="text-xs text-muted-foreground ml-1">(edited)</span>
            )}
          </p>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyToClipboard}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </DropdownMenuItem>
              {isOwn && (
                <DropdownMenuItem>
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {(isOwn || canModerate) && (
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Media */}
        {message.media_url && message.media_type === 'image' && (
          <img
            src={message.media_url}
            alt=""
            className="mt-2 max-w-sm rounded-lg"
          />
        )}
      </div>
    </div>
  );
});
