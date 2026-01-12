import { memo, useState } from 'react';
import { motion } from 'framer-motion';
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
import { useServer, useChannels, useMyServerRole, Channel } from '@/hooks/useServers';
import { CreateChannelDialog } from './CreateChannelDialog';
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
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

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
              <DropdownMenuItem>
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
        />
      </ScrollArea>

      <CreateChannelDialog
        open={showCreateChannel}
        onOpenChange={setShowCreateChannel}
        serverId={serverId}
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
}: {
  title: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  canManage: boolean;
  onCreateChannel?: () => void;
  icon: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

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
}: {
  channel: Channel;
  isSelected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
        isSelected
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate text-sm">{channel.name}</span>
    </button>
  );
});
