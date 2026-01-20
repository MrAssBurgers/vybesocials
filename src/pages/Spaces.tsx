/**
 * VYBE Spaces - Mobile-first community experience
 * Original design, NOT Discord-like
 */

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Users, Settings, Sparkles, UserPlus, ArrowLeft,
  Crown, Shield, MessageSquare, Radio, Image, HelpCircle, Megaphone
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useMyServers, useChannels, useServerMembers } from '@/hooks/useServers';
import { useUnreadCountPerServer } from '@/hooks/useServerNotifications';
import { useLiveMemberCount, useAllServerMemberCounts } from '@/hooks/useLiveMemberCount';
import { ChannelChat } from '@/components/community/ChannelChat';
import { 
  SpaceCard, 
  SpaceRoomTabs, 
  SpaceMembersList, 
  CreateSpaceSheet, 
  JoinSpaceSheet,
  SpaceSettingsSheet,
  RoomType 
} from '@/components/spaces';

export default function Spaces() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(searchParams.get('space'));
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomType>('chat');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { data: spaces = [] } = useMyServers();
  const { data: channels = [] } = useChannels(selectedSpaceId || undefined);
  const { data: members = [] } = useServerMembers(selectedSpaceId || undefined);
  const { data: unreadCounts = {} } = useUnreadCountPerServer();
  
  const serverIds = spaces.map(s => s.id);
  const liveMemberCounts = useAllServerMemberCounts(serverIds);
  const selectedSpaceLiveCount = useLiveMemberCount(selectedSpaceId || undefined);

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);

  // Auto-select first channel when space changes
  useEffect(() => {
    if (selectedSpaceId && channels.length > 0) {
      const firstTextChannel = channels.find(c => c.type === 'text');
      if (firstTextChannel) setSelectedChannelId(firstTextChannel.id);
    }
  }, [selectedSpaceId, channels]);

  // Update URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedSpaceId) params.set('space', selectedSpaceId);
    setSearchParams(params, { replace: true });
  }, [selectedSpaceId, setSearchParams]);

  const handleEnterSpace = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setActiveRoom('chat');
  };

  const handleBackToGrid = () => {
    setSelectedSpaceId(null);
    setSelectedChannelId(null);
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  // Space View (inside a space)
  if (selectedSpace) {
    return (
      <AppLayout hideRightSidebar fullWidth hideNav>
        <div className="h-[100dvh] flex flex-col bg-background">
          {/* Space Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full flex-shrink-0"
              onClick={handleBackToGrid}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <Avatar className="h-10 w-10 ring-2 ring-primary/30">
              {selectedSpace.icon_url && <AvatarImage src={selectedSpace.icon_url} />}
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-bold">
                {selectedSpace.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <h1 className="font-bold truncate flex items-center gap-1.5">
                {selectedSpace.name}
                {selectedSpace.myRole === 'owner' && <Crown className="h-4 w-4 text-yellow-500" />}
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                {selectedSpaceLiveCount} online
              </p>
            </div>

            {(selectedSpace.myRole === 'owner' || selectedSpace.myRole === 'admin') && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Room Tabs - Horizontal swipeable */}
          <SpaceRoomTabs
            activeRoom={activeRoom}
            onRoomChange={setActiveRoom}
            enabledRooms={['chat', 'announcements', 'media', 'live']}
            className="border-b border-border/50"
          />

          {/* Room Content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {activeRoom === 'chat' && selectedChannel && (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <ChannelChat
                    channelId={selectedChannelId!}
                    channelName={selectedChannel.name}
                    serverId={selectedSpaceId!}
                  />
                </motion.div>
              )}

              {activeRoom === 'members' && (
                <motion.div
                  key="members"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <SpaceMembersList
                    members={members.map(m => ({
                      id: m.id,
                      userId: m.user_id,
                      username: m.profile?.username || 'unknown',
                      displayName: m.nickname || m.profile?.display_name,
                      avatarUrl: m.profile?.avatar_url || undefined,
                      role: m.role === 'admin' ? 'moderator' : m.role as 'owner' | 'member',
                      isOnline: true,
                    }))}
                  />
                </motion.div>
              )}

              {(activeRoom === 'announcements' || activeRoom === 'media' || activeRoom === 'live') && (
                <motion.div
                  key={activeRoom}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full flex items-center justify-center p-6"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4">
                      {activeRoom === 'announcements' && <Megaphone className="h-8 w-8 text-primary" />}
                      {activeRoom === 'media' && <Image className="h-8 w-8 text-primary" />}
                      {activeRoom === 'live' && <Radio className="h-8 w-8 text-primary" />}
                    </div>
                    <h3 className="font-bold text-lg mb-2 capitalize">{activeRoom}</h3>
                    <p className="text-sm text-muted-foreground">Coming soon</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <SpaceSettingsSheet
            open={showSettings}
            onOpenChange={setShowSettings}
            spaceId={selectedSpace.id}
            myRole={selectedSpace.myRole}
            onSpaceDeleted={handleBackToGrid}
          />
        </div>
      </AppLayout>
    );
  }

  // Spaces Grid (home view)
  return (
    <AppLayout hideRightSidebar>
      <div className="min-h-screen pb-20">
        {/* Header */}
        <div className="px-4 py-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              Spaces
            </h1>
            <div className="flex gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowJoin(true)}
                className="rounded-full"
              >
                <UserPlus className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                onClick={() => setShowCreate(true)}
                className="rounded-full bg-gradient-to-r from-primary to-accent"
              >
                <Plus className="h-5 w-5 text-white" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {spaces.length} {spaces.length === 1 ? 'community' : 'communities'}
          </p>
        </div>

        {/* Spaces Grid */}
        <div className="px-4">
          {spaces.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4">
                <Users className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">No spaces yet</h2>
              <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
                Create your own community or join existing ones
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setShowCreate(true)} className="rounded-xl">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
                <Button onClick={() => setShowJoin(true)} variant="outline" className="rounded-xl">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Join
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {spaces.map((space, index) => (
                <motion.div
                  key={space.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <SpaceCard
                    id={space.id}
                    name={space.name}
                    description={space.description}
                    iconUrl={space.icon_url}
                    memberCount={liveMemberCounts[space.id] || 1}
                    liveCount={liveMemberCounts[space.id] || 0}
                    unreadCount={unreadCounts[space.id] || 0}
                    role={space.myRole === 'admin' ? 'moderator' : space.myRole as 'owner' | 'member'}
                    onEnter={() => handleEnterSpace(space.id)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateSpaceSheet open={showCreate} onOpenChange={setShowCreate} />
      <JoinSpaceSheet open={showJoin} onOpenChange={setShowJoin} />
    </AppLayout>
  );
}
