/**
 * VYBE Spaces - Community spaces with feed-first layout
 * Rebranded from Communities/Servers
 */

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Hash, Users, Settings, MessageSquare, Calendar, Film, Radio, ChevronRight, UserPlus } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useMyServers, useChannels, useServerMembers, Server, ServerRole } from '@/hooks/useServers';
import { useUnreadCountPerServer, useUnreadCountPerChannel } from '@/hooks/useServerNotifications';
import { ChannelChat } from '@/components/community/ChannelChat';
import { CreateServerDialog } from '@/components/community/CreateServerDialog';
import { JoinServerDialog } from '@/components/community/JoinServerDialog';
import { ServerSettingsSheet } from '@/components/community/ServerSettingsSheet';

export default function Spaces() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(searchParams.get('space'));
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(searchParams.get('channel'));
  const [activeTab, setActiveTab] = useState<'feed' | 'chat' | 'events' | 'members'>('feed');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { data: spaces = [] } = useMyServers();
  const { data: channels = [] } = useChannels(selectedSpaceId || undefined);
  const { data: members = [] } = useServerMembers(selectedSpaceId || undefined);
  const { data: unreadCounts = {} } = useUnreadCountPerServer();
  const { data: channelUnreads = {} } = useUnreadCountPerChannel(selectedSpaceId || undefined);

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);

  // Auto-select first space if none selected
  useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0) {
      setSelectedSpaceId(spaces[0].id);
    }
  }, [spaces, selectedSpaceId]);

  // Auto-select first channel when space changes
  useEffect(() => {
    if (selectedSpaceId && channels.length > 0 && !selectedChannelId) {
      const firstTextChannel = channels.find(c => c.type === 'text');
      if (firstTextChannel) {
        setSelectedChannelId(firstTextChannel.id);
      }
    }
  }, [selectedSpaceId, channels, selectedChannelId]);

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedSpaceId) params.set('space', selectedSpaceId);
    if (selectedChannelId) params.set('channel', selectedChannelId);
    setSearchParams(params, { replace: true });
  }, [selectedSpaceId, selectedChannelId, setSearchParams]);

  const handleSelectSpace = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setSelectedChannelId(null);
    setActiveTab('feed');
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <AppLayout hideRightSidebar fullWidth>
      <div className="h-[calc(100vh-5rem)] md:h-screen flex overflow-hidden bg-background">
        {/* Spaces sidebar */}
        <div className="w-20 md:w-72 border-r border-border bg-muted/30 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border hidden md:block">
            <h1 className="text-xl font-bold gradient-text">Spaces</h1>
            <p className="text-xs text-muted-foreground mt-1">Your communities</p>
          </div>

          {/* Spaces list */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {spaces.map((space) => (
                <SpaceItem
                  key={space.id}
                  space={space}
                  isSelected={selectedSpaceId === space.id}
                  unreadCount={unreadCounts[space.id] || 0}
                  onClick={() => handleSelectSpace(space.id)}
                />
              ))}

              {/* Add/Join buttons */}
              <div className="pt-4 space-y-2">
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/10 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Plus className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-sm hidden md:block">Create Space</span>
                </button>
                
                <button
                  onClick={() => setShowJoinDialog(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-green-500/10 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-xl bg-green-500/20 flex items-center justify-center group-hover:bg-green-500 group-hover:text-white transition-colors">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-sm hidden md:block">Join Space</span>
                </button>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedSpace ? (
            <>
              {/* Space header */}
              <div className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {selectedSpace.icon_url ? (
                      <AvatarImage src={selectedSpace.icon_url} />
                    ) : null}
                    <AvatarFallback className="bg-primary/20 text-primary font-bold">
                      {selectedSpace.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold">{selectedSpace.name}</h2>
                    <p className="text-xs text-muted-foreground">{members.length} members</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {(selectedSpace.myRole === 'owner' || selectedSpace.myRole === 'admin') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSettings(true)}
                    >
                      <Settings className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Tab navigation */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
                <div className="border-b border-border px-4">
                  <TabsList className="h-12 bg-transparent gap-2">
                    <TabsTrigger value="feed" className="gap-2 data-[state=active]:bg-primary/10">
                      <Radio className="h-4 w-4" />
                      <span className="hidden sm:inline">Feed</span>
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="gap-2 data-[state=active]:bg-primary/10 relative">
                      <Hash className="h-4 w-4" />
                      <span className="hidden sm:inline">Channels</span>
                      {Object.values(channelUnreads).reduce((a, b) => a + b, 0) > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] flex items-center justify-center text-destructive-foreground">
                          {Object.values(channelUnreads).reduce((a, b) => a + b, 0)}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="events" className="gap-2 data-[state=active]:bg-primary/10">
                      <Calendar className="h-4 w-4" />
                      <span className="hidden sm:inline">Events</span>
                    </TabsTrigger>
                    <TabsTrigger value="members" className="gap-2 data-[state=active]:bg-primary/10">
                      <Users className="h-4 w-4" />
                      <span className="hidden sm:inline">Members</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-hidden">
                  <TabsContent value="feed" className="h-full m-0 p-4">
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <Radio className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Space Feed</h3>
                        <p className="text-muted-foreground max-w-sm">
                          Posts and updates from this space will appear here
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="chat" className="h-full m-0 flex">
                    {/* Channel list */}
                    <div className="w-48 border-r border-border p-2 hidden sm:block">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
                        Channels
                      </p>
                      {channels.map((channel) => (
                        <button
                          key={channel.id}
                          onClick={() => setSelectedChannelId(channel.id)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                            selectedChannelId === channel.id
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Hash className="h-4 w-4" />
                          <span className="truncate">{channel.name}</span>
                          {(channelUnreads[channel.id] || 0) > 0 && (
                            <span className="ml-auto bg-destructive text-destructive-foreground text-xs rounded-full px-1.5">
                              {channelUnreads[channel.id]}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Chat area */}
                    <div className="flex-1">
                      {selectedChannel ? (
                        <ChannelChat
                          channelId={selectedChannelId!}
                          channelName={selectedChannel.name}
                          serverId={selectedSpaceId!}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          Select a channel
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="events" className="h-full m-0 p-4">
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Events</h3>
                        <p className="text-muted-foreground max-w-sm">
                          Upcoming events for this space will appear here
                        </p>
                        <Button className="mt-4" variant="outline">
                          Create Event
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="members" className="h-full m-0">
                    <ScrollArea className="h-full">
                      <div className="p-4 space-y-2">
                        {members.map((member) => (
                          <Link
                            key={member.id}
                            to={`/profile/${member.profile?.username || member.user_id}`}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
                          >
                            <Avatar>
                              <AvatarImage src={member.profile?.avatar_url || undefined} />
                              <AvatarFallback>
                                {member.profile?.username?.charAt(0)?.toUpperCase() || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {member.nickname || member.profile?.display_name || member.profile?.username}
                              </p>
                              <p className="text-xs text-muted-foreground">@{member.profile?.username}</p>
                            </div>
                            <RoleBadge role={member.role} />
                          </Link>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </div>
              </Tabs>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Users className="h-20 w-20 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Welcome to Spaces</h2>
                <p className="text-muted-foreground max-w-sm mb-6">
                  Create or join a space to connect with your community
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={() => setShowCreateDialog(true)} variant="gradient">
                    Create Space
                  </Button>
                  <Button onClick={() => setShowJoinDialog(true)} variant="outline">
                    Join Space
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateServerDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <JoinServerDialog open={showJoinDialog} onOpenChange={setShowJoinDialog} />
      {selectedSpace && (
        <ServerSettingsSheet
          serverId={selectedSpace.id}
          myRole={selectedSpace.myRole}
          open={showSettings}
          onOpenChange={setShowSettings}
        />
      )}
    </AppLayout>
  );
}

// Space list item
function SpaceItem({
  space,
  isSelected,
  unreadCount,
  onClick,
}: {
  space: Server & { myRole: ServerRole };
  isSelected: boolean;
  unreadCount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-2 md:p-3 rounded-xl transition-all",
        isSelected 
          ? "bg-primary/10 ring-2 ring-primary/30" 
          : "hover:bg-muted"
      )}
    >
      <div className="relative">
        <Avatar className={cn("h-10 w-10", isSelected && "ring-2 ring-primary")}>
          {space.icon_url ? (
            <AvatarImage src={space.icon_url} />
          ) : null}
          <AvatarFallback className="bg-primary/20 text-primary font-bold text-sm">
            {space.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {unreadCount > 0 && !isSelected && (
          <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left hidden md:block">
        <p className={cn("font-medium truncate text-sm", isSelected && "text-primary")}>
          {space.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {space.member_count || 0} members
        </p>
      </div>
      <ChevronRight className={cn(
        "h-4 w-4 text-muted-foreground hidden md:block transition-transform",
        isSelected && "text-primary rotate-90"
      )} />
    </button>
  );
}

// Role badge component
function RoleBadge({ role }: { role: ServerRole }) {
  const roleConfig = {
    owner: { label: 'Owner', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
    admin: { label: 'Admin', className: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
    moderator: { label: 'Mod', className: 'bg-purple-500/10 text-purple-500 border-purple-500/30' },
    member: { label: '', className: '' },
  };

  const config = roleConfig[role] || roleConfig.member;
  if (!config.label) return null;

  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-xs font-medium border",
      config.className
    )}>
      {config.label}
    </span>
  );
}
