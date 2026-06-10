import { useState, useRef, useEffect, memo, useMemo, useCallback } from 'react';
import { Send, Loader2, MoreHorizontal, Copy, Trash2, Edit3, Image, Paperclip } from 'lucide-react';
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
import { useChannelMessages, useSendChannelMessage, ChannelMessage, useMyServerRole } from '@/hooks/useServers';
import { useAuth } from '@/lib/auth';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import { RoomType } from '@/hooks/useCommunities';
import { navVisibility } from '@/lib/navVisibility';

interface RoomChatProps {
  roomId: string;
  roomName: string;
  roomType: RoomType;
  communityId: string;
}

export const RoomChat = memo(function RoomChat({ 
  roomId, 
  roomName, 
  roomType,
  communityId 
}: RoomChatProps) {
  const { profile } = useAuth();
  const { data: messages = [], isLoading } = useChannelMessages(roomId);
  const sendMessage = useSendChannelMessage();
  const { data: myRole } = useMyServerRole(communityId);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canModerate = myRole === 'owner' || myRole === 'admin' || myRole === 'moderator';
  const isAnnouncement = roomType === 'announcements';
  const canPost = !isAnnouncement || canModerate;

  // Handle input focus to hide nav on mobile keyboard (shell owns immersive nav)
  const handleInputFocus = useCallback(() => {
    navVisibility.setCommunityInputFocused(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    navVisibility.setCommunityInputFocused(false);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || sendMessage.isPending || !canPost) return;

    const text = messageText.trim();
    setMessageText('');

    await sendMessage.mutateAsync({
      channelId: roomId,
      content: text,
    });
    
    // Refocus input
    inputRef.current?.focus();
  }, [messageText, roomId, sendMessage, canPost]);

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
    <div className="flex flex-col h-full min-h-0 bg-background/50">
      {/* Messages - scrollable area fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full px-3">
          <div className="py-4">
            {groupedMessages.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-[10px] text-muted-foreground/60 font-medium px-2">
                    {formatDateHeader(group.date)}
                  </span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>

                {/* Messages */}
                <div className="space-y-0.5">
                  {group.messages.map((message, index) => {
                    const prevMessage = index > 0 ? group.messages[index - 1] : null;
                    const showFullHeader = !prevMessage || 
                      prevMessage.sender_id !== message.sender_id ||
                      new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 5 * 60 * 1000;

                    return (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isOwn={message.sender_id === profile?.id}
                        showFullHeader={showFullHeader}
                        canModerate={canModerate}
                        isAnnouncement={isAnnouncement}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <RoomTypeIcon type={roomType} className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1 text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">Welcome to {roomName}</h3>
                <p className="text-foreground/70 text-sm max-w-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                  {getRoomWelcomeMessage(roomType)}
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input - pinned at bottom via flex shrink-0 */}
      {canPost ? (
        <div className="shrink-0 px-3 py-3 border-t border-border/50 bg-card/95 backdrop-blur-md pb-safe z-10">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder={`Message ${roomName}...`}
              className="flex-1 h-11 rounded-full bg-foreground/5 border-border px-4"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMessage.isPending}
              className="h-11 w-11 rounded-full shrink-0"
            >
              {sendMessage.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 px-4 py-3 border-t border-border/50 bg-card/95 backdrop-blur-md text-center text-sm text-foreground/70 pb-safe z-10">
          Only moderators can post in announcements
        </div>
      )}
    </div>
  );
});

// Message bubble component
const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showFullHeader,
  canModerate,
  isAnnouncement,
}: {
  message: ChannelMessage;
  isOwn: boolean;
  showFullHeader: boolean;
  canModerate: boolean;
  isAnnouncement: boolean;
}) {
  // All hooks at the top
  const [showMenu, setShowMenu] = useState(false);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);

  const copyToClipboard = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      toast.success('Copied!');
    }
  };

  const handleTouchStart = useCallback(() => {
    longPressRef.current = setTimeout(() => {
      setShowMenu(true);
    }, 400);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  return (
    <div className={cn(
      "group px-2 py-1 rounded-xl transition-colors",
      showFullHeader ? "pt-3" : "pt-0.5",
      isAnnouncement && "bg-amber-500/5 border-l-2 border-amber-500/50 pl-3"
    )}>
      <div className={cn(
        "flex gap-3",
        !showFullHeader && "pl-12"
      )}>
        {showFullHeader && (
          <Avatar className="h-9 w-9 shrink-0 mt-0.5">
            <AvatarImage src={message.sender?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">
              {(message.sender?.display_name || message.sender?.username)?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="flex-1 min-w-0">
          {showFullHeader && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-semibold text-sm">
                {message.sender?.display_name || message.sender?.username}
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                {format(new Date(message.created_at), 'h:mm a')}
              </span>
            </div>
          )}

          <div className="flex items-start gap-2">
            <p 
              className="text-sm text-foreground break-words flex-1 leading-relaxed min-w-0"
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onTouchMove={handleTouchMove}
            >
              {message.content}
              {message.is_edited && (
                <span className="text-[10px] text-muted-foreground/50 ml-1">(edited)</span>
              )}
            </p>

            {showMenu && (
              <>
                {/* Menu backdrop */}
                <div 
                  className="fixed inset-0 bg-black/40 z-[99]"
                  onClick={() => setShowMenu(false)}
                />
                {/* Menu */}
                <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl z-[100] min-w-[180px] py-2">
                  <button
                    onClick={() => { copyToClipboard(); setShowMenu(false); }}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted flex items-center gap-3"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </button>
                  {isOwn && (
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted flex items-center gap-3"
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  {(isOwn || canModerate) && (
                    <button className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted text-destructive flex items-center gap-3">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
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

          {/* Media - with safety gating */}
          {message.media_url && (message.media_type === 'image' || message.media_type === 'video') && (
            <div className="mt-2">
              <ServerSafetyGate
                mediaUrl={message.media_url}
                mediaType={message.media_type}
                className="max-w-xs"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// Helper components
import { MessageCircle, Megaphone, ImageIcon, Radio, HelpCircle } from 'lucide-react';

function RoomTypeIcon({ type, className }: { type: RoomType; className?: string }) {
  const icons = {
    chat: MessageCircle,
    announcements: Megaphone,
    media: ImageIcon,
    live: Radio,
    qa: HelpCircle,
  };
  const Icon = icons[type] || MessageCircle;
  return <Icon className={className} />;
}

function getRoomWelcomeMessage(type: RoomType): string {
  const messages = {
    chat: 'This is the start of the conversation. Say hi!',
    announcements: 'Important updates and announcements will appear here.',
    media: 'Share photos, videos, and other media here.',
    live: 'Join live sessions and hang out with the community.',
    qa: 'Ask questions and get answers from the community.',
  };
  return messages[type] || messages.chat;
}
