import { memo, useState, useEffect } from 'react';
import { Hash, Volume2, Megaphone, Plus, Settings, ChevronDown, Users, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useServer, useChannels, useMyServerRole, Channel, ServerRole } from '@/hooks/useServers';
import { useUnreadCountPerChannel, useMarkChannelRead } from '@/hooks/useServerNotifications';
import { CreateChannelDialog } from './CreateChannelDialog';
import { ServerSettingsSheet } from './ServerSettingsSheet';
import { toast } from 'sonner';

interface ChannelSidebarProps {
  serverId: string;
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

export const ChannelSidebar = memo(function ChannelSidebar({
  serverId,
  selectedChannelId,
  onSelectChannel,
}: ChannelSidebarProps) {
  const { data: server } = useServer(serverId);
  const { data: channels = [] } = useChannels(serverId);
  const { data: myRole } = useMyServerRole(serverId);
  const { data: unreadCounts = {} } = useUnreadCountPerChannel(serverId);
  const markChannelRead = useMarkChannelRead();
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Mark channel as read when selected
  useEffect(() => {
    if (selectedChannelId && unreadCounts[selectedChannelId] > 0) {
      markChannelRead.mutate(selectedChannelId);
    }
  }, [selectedChannelId]);

  const canManageChannels = myRole === 'owner' || myRole === 'admin';

  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');
  const announcementChannels = channels.filter(c => c.type === 'announcement');

  const copyInviteCode = () => {
    if (server?.invite_code) {
      navigator.clipboard.writeText(server.invite_code);
      setCopiedInvite(true);
      toast.success('Invite code copied!');
      setTimeout(() => setCopiedInvite(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full w-60 bg-muted/20 border-r border-border">
      {/* Server header */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors border-b border-border">
            <h2 className="font-semibold truncate">{server?.name || 'Loading...'}</h2>
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={copyInviteCode}>
            {copiedInvite ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy Invite Code
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Users className="h-4 w-4 mr-2" />
            View Members
          </DropdownMenuItem>
          {canManageChannels && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowSettings(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Server Settings
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Channels */}
      <ScrollArea className="flex-1 px-2 py-3">
        {/* Text channels */}
        <ChannelGroup
          title="Text Channels"
          channels={textChannels}
          selectedChannelId={selectedChannelId}
          onSelectChannel={onSelectChannel}
          canManage={canManageChannels}
          onCreateChannel={() => setShowCreateChannel(true)}
          icon={<Hash className="h-4 w-4" />}
          unreadCounts={unreadCounts}
        />

        {/* Announcement channels */}
        {announcementChannels.length > 0 && (
          <ChannelGroup
            title="Announcements"
            channels={announcementChannels}
            selectedChannelId={selectedChannelId}
            onSelectChannel={onSelectChannel}
            canManage={canManageChannels}
            icon={<Megaphone className="h-4 w-4" />}
            unreadCounts={unreadCounts}
          />
        )}

        {/* Voice channels */}
        <ChannelGroup
          title="Voice Channels"
          channels={voiceChannels}
          selectedChannelId={selectedChannelId}
          onSelectChannel={onSelectChannel}
          canManage={canManageChannels}
          icon={<Volume2 className="h-4 w-4" />}
          unreadCounts={unreadCounts}
        />
      </ScrollArea>

      <CreateChannelDialog
        open={showCreateChannel}
        onOpenChange={setShowCreateChannel}
        serverId={serverId}
      />

      <ServerSettingsSheet
        open={showSettings}
        onOpenChange={setShowSettings}
        serverId={serverId}
        myRole={myRole as ServerRole | null}
      />
    </div>
  );
});

// Channel group component
function ChannelGroup({
  title,
  channels,
  selectedChannelId,
  onSelectChannel,
  canManage,
  onCreateChannel,
  icon,
  unreadCounts = {},
}: {
  title: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  canManage: boolean;
  onCreateChannel?: () => void;
  icon: React.ReactNode;
  unreadCounts?: Record<string, number>;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Calculate total unread for this group
  const totalUnread = channels.reduce((sum, c) => sum + (unreadCounts[c.id] || 0), 0);

  return (
    <div className="mb-4">
      {/* Group header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-1 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-1">
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              !isExpanded && "-rotate-90"
            )}
          />
          <span>{title}</span>
          {totalUnread > 0 && !isExpanded && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full">
              {totalUnread}
            </span>
          )}
        </div>
        {canManage && onCreateChannel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateChannel();
            }}
            className="hover:text-foreground p-0.5"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {/* Channels */}
      {isExpanded && (
        <div className="space-y-0.5 mt-1">
          {channels.map((channel) => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              isSelected={selectedChannelId === channel.id}
              onClick={() => onSelectChannel(channel.id)}
              icon={icon}
              unreadCount={unreadCounts[channel.id] || 0}
            />
          ))}
          {channels.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">No channels</p>
          )}
        </div>
      )}
    </div>
  );
}

// Individual channel item
const ChannelItem = memo(function ChannelItem({
  channel,
  isSelected,
  onClick,
  icon,
  unreadCount,
}: {
  channel: Channel;
  isSelected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  unreadCount: number;
}) {
  const hasUnread = unreadCount > 0 && !isSelected;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
        isSelected
          ? "bg-muted text-foreground"
          : hasUnread
          ? "text-foreground font-medium hover:bg-muted/50"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      <span className={cn("text-muted-foreground", hasUnread && "text-foreground")}>{icon}</span>
      <span className="truncate text-sm flex-1">{channel.name}</span>
      {hasUnread && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
});
