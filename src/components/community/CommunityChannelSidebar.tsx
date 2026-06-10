import { memo, useState } from 'react';
import {
  Hash,
  Volume2,
  Megaphone,
  Plus,
  ChevronDown,
  Copy,
  Check,
  Settings,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Room } from '@/hooks/useCommunities';
import { isVoiceChannel } from '@/lib/communityChannels';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { toast } from 'sonner';

interface VoicePresenceUser {
  userId: string;
  name: string;
  avatar?: string | null;
}

interface CommunityChannelSidebarProps {
  serverName: string;
  rooms: Room[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  canManage: boolean;
  onCreateChannel: () => void;
  onOpenSettings: () => void;
  voicePresenceByChannel: Record<string, VoicePresenceUser[]>;
  connectedVoiceChannelId: string | null;
  unreadCounts?: Record<string, number>;
}

export const CommunityChannelSidebar = memo(function CommunityChannelSidebar({
  serverName,
  rooms,
  selectedRoomId,
  onSelectRoom,
  canManage,
  onCreateChannel,
  onOpenSettings,
  voicePresenceByChannel,
  connectedVoiceChannelId,
  unreadCounts = {},
}: CommunityChannelSidebarProps) {
  const [copiedInvite, setCopiedInvite] = useState(false);

  const textRooms = rooms.filter((r) => r.type === 'text' && r.room_type !== 'announcements');
  const announcementRooms = rooms.filter(
    (r) => r.type === 'announcement' || r.room_type === 'announcements',
  );
  const voiceRooms = rooms.filter((r) => isVoiceChannel(r));

  const copyInvite = () => {
    toast.success('Open server settings to copy invite code');
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  return (
    <div className="community-sidebar flex flex-col h-full min-h-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="community-sidebar-header flex items-center justify-between gap-2 shrink-0"
          >
            <span className="font-bold truncate text-left community-title-gradient">{serverName}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={copyInvite}>
            {copiedInvite ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Invite People
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenSettings}>
                <Settings className="h-4 w-4 mr-2" />
                Server Settings
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ScrollArea className="flex-1 px-2 py-2">
        <ChannelGroup
          title="Text Channels"
          icon={<Hash className="h-3.5 w-3.5" />}
          rooms={textRooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
          unreadCounts={unreadCounts}
          canManage={canManage}
          onCreateChannel={onCreateChannel}
        />

        {announcementRooms.length > 0 && (
          <ChannelGroup
            title="Announcements"
            icon={<Megaphone className="h-3.5 w-3.5" />}
            rooms={announcementRooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={onSelectRoom}
            unreadCounts={unreadCounts}
            canManage={canManage}
          />
        )}

        <ChannelGroup
          title="Voice Channels"
          icon={<Volume2 className="h-3.5 w-3.5" />}
          rooms={voiceRooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
          unreadCounts={unreadCounts}
          canManage={canManage}
          isVoice
          voicePresenceByChannel={voicePresenceByChannel}
          connectedVoiceChannelId={connectedVoiceChannelId}
        />
      </ScrollArea>
    </div>
  );
});

function ChannelGroup({
  title,
  icon,
  rooms,
  selectedRoomId,
  onSelectRoom,
  unreadCounts,
  canManage,
  onCreateChannel,
  isVoice,
  voicePresenceByChannel = {},
  connectedVoiceChannelId,
}: {
  title: string;
  icon: React.ReactNode;
  rooms: Room[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string) => void;
  unreadCounts: Record<string, number>;
  canManage?: boolean;
  onCreateChannel?: () => void;
  isVoice?: boolean;
  voicePresenceByChannel?: Record<string, VoicePresenceUser[]>;
  connectedVoiceChannelId?: string | null;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="community-channel-group-header w-full"
      >
        <span className="flex items-center gap-1 min-w-0">
          <ChevronDown
            className={cn('h-3 w-3 shrink-0 transition-transform', !expanded && '-rotate-90')}
          />
          <span className="truncate">{title}</span>
        </span>
        {canManage && onCreateChannel && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChannel();
            }}
            className="p-0.5 rounded hover:bg-foreground/10 opacity-60 hover:opacity-100"
            aria-label={`Create ${title}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {rooms.map((room) => (
            <div key={room.id}>
              <ChannelRow
                room={room}
                icon={icon}
                isSelected={selectedRoomId === room.id}
                isConnected={connectedVoiceChannelId === room.id}
                unread={unreadCounts[room.id] || 0}
                onClick={() => onSelectRoom(room.id)}
              />
              {isVoice && (voicePresenceByChannel[room.id]?.length ?? 0) > 0 && (
                <div className="ml-6 pl-2 border-l border-foreground/8 space-y-0.5 mb-1">
                  {voicePresenceByChannel[room.id].map((u) => (
                    <VoicePresenceRow key={u.userId} user={u} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {rooms.length === 0 && (
            <p className="text-[11px] text-muted-foreground px-2 py-1">No channels yet</p>
          )}
        </div>
      )}
    </div>
  );
}

function ChannelRow({
  room,
  icon,
  isSelected,
  isConnected,
  unread,
  onClick,
}: {
  room: Room;
  icon: React.ReactNode;
  isSelected: boolean;
  isConnected?: boolean;
  unread: number;
  onClick: () => void;
}) {
  const hasUnread = unread > 0 && !isSelected;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'community-channel-row w-full',
        isSelected && 'community-channel-row--active',
        isConnected && 'community-channel-row--voice-connected',
        hasUnread && 'font-medium',
      )}
    >
      <span className={cn('shrink-0 opacity-70', hasUnread && 'opacity-100')}>{icon}</span>
      <span className="truncate flex-1 text-left">{room.name}</span>
      {isConnected && (
        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0 animate-pulse" />
      )}
      {hasUnread && (
        <span className="community-channel-unread shrink-0">{unread > 99 ? '99+' : unread}</span>
      )}
    </button>
  );
}

function VoicePresenceRow({ user }: { user: VoicePresenceUser }) {
  const avatar = useSignedUrl(user.avatar);

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-md text-xs text-muted-foreground">
      <Avatar className="h-5 w-5">
        {avatar ? <AvatarImage src={avatar} alt={user.name} /> : null}
        <AvatarFallback className="text-[9px]">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate">{user.name}</span>
    </div>
  );
}
