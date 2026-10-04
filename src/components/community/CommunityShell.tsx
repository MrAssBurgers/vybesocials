import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash,
  Volume2,
  Megaphone,
  Menu,
  Settings,
  Share2,
  Bell,
  ChevronDown,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Community, Room, RoomType, useLiveActivity, useUpdateActivity } from '@/hooks/useCommunities';
import { useCommunityMembers } from '@/hooks/useCommunities';
import { useMarkChannelRead, useUnreadCountPerChannel } from '@/hooks/useServerNotifications';
import { useLiveMemberCount } from '@/hooks/useLiveMemberCount';
import { useAuth } from '@/lib/auth';
import { isVoiceChannel } from '@/lib/communityChannels';
import { CommunityVoiceProvider, useCommunityVoiceContext } from '@/contexts/CommunityVoiceContext';
import { navVisibility } from '@/lib/navVisibility';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { CommunityOrbitBar } from './CommunityOrbitBar';
import { CommunityChannelSidebar } from './CommunityChannelSidebar';
import { RoomChat } from './RoomChat';
import { VoiceChannelView } from './VoiceChannelView';
import { VoiceConnectionBar } from './VoiceConnectionBar';
import { MembersPanel } from './MembersPanel';
import { ServerManagement } from './ServerManagement';
import { CreateChannelDialog } from './CreateChannelDialog';
import { toast } from 'sonner';
import type { CommunityRole } from '@/hooks/useCommunities';

interface CommunityShellProps {
  communities: (Community & { myRole?: CommunityRole })[];
  selectedCommunity: Community;
  selectedCommunityId: string;
  rooms: Room[];
  selectedRoomId: string | null;
  onSelectCommunity: (id: string) => void;
  onSelectRoom: (id: string) => void;
  onBackToList: () => void;
  onBackToDiscover: () => void;
  onCreateCommunity: () => void;
  serverUnreadCounts?: Record<string, number>;
  myRole?: CommunityRole;
}

function CommunityShellInner({
  communities,
  selectedCommunity,
  selectedCommunityId,
  rooms,
  selectedRoomId,
  onSelectCommunity,
  onSelectRoom,
  onBackToList,
  onBackToDiscover,
  onCreateCommunity,
  serverUnreadCounts = {},
  myRole,
}: CommunityShellProps) {
  const { profile } = useAuth();
  const voice = useCommunityVoiceContext();
  const updateActivity = useUpdateActivity();
  const { data: liveActivity = [] } = useLiveActivity(selectedCommunityId);
  const { data: members = [] } = useCommunityMembers(selectedCommunityId);
  const { data: roomUnreadCounts = {} } = useUnreadCountPerChannel(selectedCommunityId);
  const markChannelRead = useMarkChannelRead();
  const liveCount = useLiveMemberCount(selectedCommunityId);

  const [showSettings, setShowSettings] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [mobileChannelsOpen, setMobileChannelsOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(true);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const canManage = myRole === 'owner' || myRole === 'admin';
  const communityCover = useSignedUrl(selectedCommunity.cover_url || selectedCommunity.banner_url);
  const communityIcon = useSignedUrl(selectedCommunity.icon_url);

  useEffect(() => {
    navVisibility.setImmersiveView(true);
    navVisibility.setInCommunityChat(true);
    return () => {
      navVisibility.setImmersiveView(false);
      navVisibility.setInCommunityChat(false);
    };
  }, []);

  const voicePresenceByChannel = useMemo(() => {
    const map: Record<string, { userId: string; name: string; avatar?: string | null }[]> = {};
    liveActivity
      .filter((a) => a.activity_type === 'live' && a.room_id)
      .forEach((a) => {
        const member = members.find((m) => m.user_id === a.user_id);
        const entry = {
          userId: a.user_id,
          name: member?.profile?.display_name || member?.profile?.username || 'Member',
          avatar: member?.profile?.avatar_url,
        };
        if (!map[a.room_id!]) map[a.room_id!] = [];
        map[a.room_id!].push(entry);
      });
    return map;
  }, [liveActivity, members]);

  // Auto-join voice when selecting a voice channel
  useEffect(() => {
    if (!selectedRoom || !isVoiceChannel(selectedRoom)) return;
    void voice.connect(selectedCommunityId, selectedRoom.id, selectedRoom.name);
  }, [selectedRoom?.id, selectedCommunityId, selectedRoom?.name]);

  // Track presence in live_activity (voice + text)
  useEffect(() => {
    if (!profile?.id) return;

    if (voice.isConnected && voice.connection?.serverId === selectedCommunityId) {
      updateActivity.mutate({
        communityId: selectedCommunityId,
        activityType: 'live',
        roomId: voice.connection.channelId,
      });
      const interval = setInterval(() => {
        if (voice.connection?.serverId === selectedCommunityId) {
          updateActivity.mutate({
            communityId: selectedCommunityId,
            activityType: 'live',
            roomId: voice.connection.channelId,
          });
        }
      }, 2 * 60 * 1000);
      return () => clearInterval(interval);
    }

    if (selectedRoom) {
      updateActivity.mutate({
        communityId: selectedCommunityId,
        activityType: isVoiceChannel(selectedRoom) ? 'listening' : 'chatting',
        roomId: selectedRoom.id,
      });
    }
  }, [
    voice.isConnected,
    voice.connection?.channelId,
    voice.connection?.serverId,
    selectedCommunityId,
    selectedRoom?.id,
    selectedRoom?.type,
    selectedRoom?.room_type,
    profile?.id,
  ]);

  // Leave voice when switching communities
  useEffect(() => {
    if (
      voice.connection &&
      voice.connection.serverId !== selectedCommunityId
    ) {
      void voice.disconnect();
    }
  }, [selectedCommunityId]);

  useEffect(() => {
    if (selectedRoomId && roomUnreadCounts[selectedRoomId] > 0) {
      markChannelRead.mutate(selectedRoomId);
    }
  }, [selectedRoomId]);

  const handleSelectRoom = useCallback(
    (roomId: string) => {
      onSelectRoom(roomId);
      setMobileChannelsOpen(false);
    },
    [onSelectRoom],
  );

  const channelIcon = selectedRoom
    ? isVoiceChannel(selectedRoom)
      ? Volume2
      : selectedRoom.room_type === 'announcements'
        ? Megaphone
        : Hash
    : Hash;

  const ChannelIcon = channelIcon;

  const sidebar = (
    <CommunityChannelSidebar
      serverName={selectedCommunity.name}
      rooms={rooms}
      selectedRoomId={selectedRoomId}
      onSelectRoom={handleSelectRoom}
      canManage={canManage}
      onCreateChannel={() => setShowCreateChannel(true)}
      onOpenSettings={() => setShowSettings(true)}
      voicePresenceByChannel={voicePresenceByChannel}
      connectedVoiceChannelId={voice.connection?.channelId ?? null}
      unreadCounts={roomUnreadCounts}
    />
  );

  const mainContent = selectedRoom ? (
    isVoiceChannel(selectedRoom) ? (
      <VoiceChannelView
        channelId={selectedRoom.id}
        channelName={selectedRoom.name}
        communityId={selectedCommunityId}
      />
    ) : (
      <RoomChat
        roomId={selectedRoom.id}
        roomName={selectedRoom.name}
        roomType={(selectedRoom.room_type || 'chat') as RoomType}
        communityId={selectedCommunityId}
      />
    )
  ) : (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 community-welcome">
      <div className="community-welcome-icon mb-4">
        <Hash className="h-10 w-10 text-primary" />
      </div>
      <h2 className="text-xl font-bold community-title-gradient mb-1">Pick a channel</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Pick a text channel to chat or a voice lounge to hang out live with your crew.
      </p>
    </div>
  );

  return (
    <div className="community-shell community-shell--immersive h-full flex flex-col overflow-hidden">
      {/* VYBE orbit switcher + server identity */}
      <div className="community-hero shrink-0 relative overflow-hidden">
        {communityCover && (
          <img src={communityCover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <div className="community-hero-aurora absolute inset-0" />
        <div className="relative z-10 px-3 pt-[calc(var(--sat,0px)+0.5rem)] pb-3 space-y-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToList}
              className="h-9 w-9 shrink-0 community-hero-btn"
            >
              <ChevronDown className="h-4 w-4 rotate-90" />
            </Button>
            <div className="community-hero-icon shrink-0">
              {communityIcon ? (
                <img src={communityIcon} alt="" className="h-full w-full object-cover rounded-[inherit]" />
              ) : (
                <span className="text-sm font-black">{selectedCommunity.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-base truncate community-title-gradient">{selectedCommunity.name}</h1>
              <p className="text-[11px] text-muted-foreground">
                {selectedCommunity.member_count} members
                {liveCount > 0 && (
                  <span className="text-green-400 ml-1.5">· {liveCount} vibing</span>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 community-hero-btn xl:hidden"
              onClick={() => setShowMembers((v) => !v)}
            >
              <Users className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 community-hero-btn"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
          <CommunityOrbitBar
            communities={communities}
            selectedId={selectedCommunityId}
            onSelect={onSelectCommunity}
            onCreate={onCreateCommunity}
            onDiscover={onBackToDiscover}
            unreadCounts={serverUnreadCounts}
            compact
          />
        </div>
      </div>

      <div className="flex flex-1 min-w-0 min-h-0">
        <div className="hidden md:flex w-[240px] lg:w-[260px] shrink-0 flex-col min-h-0">
          {sidebar}
        </div>

        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <header className="community-channel-header shrink-0 flex items-center gap-2 px-3 py-2 border-b border-foreground/8">
            <Sheet open={mobileChannelsOpen} onOpenChange={setMobileChannelsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-9 w-9 shrink-0">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 border-r border-foreground/10">
                {sidebar}
              </SheetContent>
            </Sheet>

            {selectedRoom && (
              <>
                <ChannelIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <h1 className="font-semibold text-sm truncate flex-1">{selectedRoom.name}</h1>
              </>
            )}
            {!selectedRoom && (
              <h1 className="font-semibold text-sm truncate flex-1 community-title-gradient">
                {selectedCommunity.name}
              </h1>
            )}

            <div className="flex items-center gap-1 shrink-0">
              {liveCount > 0 && (
                <span className="hidden sm:flex items-center gap-1 text-[11px] text-green-400 px-2 py-0.5 rounded-full bg-green-500/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  {liveCount} live
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hidden lg:flex"
                onClick={() => {
                  navigator.clipboard.writeText(selectedCommunity.invite_code);
                  toast.success('Invite code copied!');
                }}
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hidden lg:flex">
                <Bell className="h-4 w-4" />
              </Button>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="hidden xl:flex text-xs h-8"
                onClick={() => setShowMembers((v) => !v)}
              >
                Members
              </Button>
            </div>
          </header>

          <div className="flex flex-1 min-h-0">
            <main className="flex-1 min-w-0 min-h-0 relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedRoom?.id || 'empty'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0"
                >
                  {mainContent}
                </motion.div>
              </AnimatePresence>
            </main>

            {showMembers && (
              <aside className="hidden xl:flex w-[240px] shrink-0 border-l border-foreground/8 community-members-panel overflow-y-auto">
                <div className="p-4 w-full">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Members — {selectedCommunity.member_count}
                  </h3>
                  <MembersPanel communityId={selectedCommunityId} />
                </div>
              </aside>
            )}
          </div>

          <VoiceConnectionBar />
        </div>
      </div>

      {selectedCommunityId && myRole && (
        <ServerManagement
          serverId={selectedCommunityId}
          myRole={myRole}
          open={showSettings}
          onOpenChange={setShowSettings}
          onServerDeleted={onBackToList}
        />
      )}

      <CreateChannelDialog
        open={showCreateChannel}
        onOpenChange={setShowCreateChannel}
        serverId={selectedCommunityId}
      />
    </div>
  );
}

export const CommunityShell = memo(function CommunityShell(props: CommunityShellProps) {
  return (
    <CommunityVoiceProvider>
      <CommunityShellInner {...props} />
    </CommunityVoiceProvider>
  );
});
