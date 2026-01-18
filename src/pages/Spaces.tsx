/**
 * VYBE Spaces - Community spaces with a unique VYBE aesthetic
 * Modern, fluid design - NOT a Discord clone
 */

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Hash, Users, Settings, MessageSquare, Calendar, 
  Sparkles, ChevronDown, UserPlus, Crown, Shield, Star,
  Zap, Radio, ArrowRight, MoreHorizontal
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useMyServers, useChannels, useServerMembers, Server, ServerRole } from '@/hooks/useServers';
import { useUnreadCountPerServer, useUnreadCountPerChannel } from '@/hooks/useServerNotifications';
import { useLiveMemberCount, useAllServerMemberCounts } from '@/hooks/useLiveMemberCount';
import { ChannelChat } from '@/components/community/ChannelChat';
import { CreateServerDialog } from '@/components/community/CreateServerDialog';
import { JoinServerDialog } from '@/components/community/JoinServerDialog';
import { ServerSettingsSheet } from '@/components/community/ServerSettingsSheet';

export default function Spaces() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(searchParams.get('space'));
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(searchParams.get('channel'));
  const [activeTab, setActiveTab] = useState<'feed' | 'chat' | 'events' | 'members'>('chat');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedSpace, setExpandedSpace] = useState<string | null>(null);

  const { data: spaces = [] } = useMyServers();
  const { data: channels = [] } = useChannels(selectedSpaceId || undefined);
  const { data: members = [] } = useServerMembers(selectedSpaceId || undefined);
  const { data: unreadCounts = {} } = useUnreadCountPerServer();
  const { data: channelUnreads = {} } = useUnreadCountPerChannel(selectedSpaceId || undefined);
  
  // Live member counts for all spaces
  const serverIds = spaces.map(s => s.id);
  const liveMemberCounts = useAllServerMemberCounts(serverIds);
  
  // Live count for selected space
  const selectedSpaceLiveCount = useLiveMemberCount(selectedSpaceId || undefined);

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);

  // Auto-select first space if none selected
  useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0) {
      setSelectedSpaceId(spaces[0].id);
      setExpandedSpace(spaces[0].id);
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
    setExpandedSpace(spaceId);
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <AppLayout hideRightSidebar fullWidth>
      <div className="h-[calc(100vh-5rem)] md:h-screen flex overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
        {/* Left Panel - Spaces */}
        <div className="w-full max-w-xs md:max-w-sm border-r border-border/50 flex flex-col bg-card/30 backdrop-blur-sm">
          {/* Header */}
          <div className="p-4 md:p-6 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  Spaces
                </h1>
                <p className="text-xs text-muted-foreground mt-1">
                  {spaces.length} {spaces.length === 1 ? 'community' : 'communities'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowJoinDialog(true)}
                  className="rounded-xl hover:bg-primary/10"
                >
                  <UserPlus className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowCreateDialog(true)}
                  className="rounded-xl hover:bg-primary/10"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Spaces List */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {spaces.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                  <p className="font-medium mb-1">No spaces yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create or join a space to get started
                  </p>
                  <Button 
                    onClick={() => setShowCreateDialog(true)}
                    className="rounded-xl bg-gradient-to-r from-primary to-accent"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Space
                  </Button>
                </div>
              ) : (
                spaces.map((space, index) => {
                  const isSelected = selectedSpaceId === space.id;
                  const isExpanded = expandedSpace === space.id;
                  const unread = unreadCounts[space.id] || 0;
                  const memberCount = liveMemberCounts[space.id] ?? space.member_count ?? 0;

                  return (
                    <motion.div
                      key={space.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      {/* Space Card */}
                      <motion.button
                        onClick={() => handleSelectSpace(space.id)}
                        className={cn(
                          "w-full p-4 rounded-2xl text-left transition-all relative overflow-hidden group",
                          isSelected 
                            ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent ring-1 ring-primary/30" 
                            : "hover:bg-muted/50"
                        )}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* Glow effect when selected */}
                        {isSelected && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent"
                            layoutId="spaceGlow"
                            transition={{ type: 'spring', damping: 30 }}
                          />
                        )}
                        
                        <div className="relative flex items-center gap-3">
                          {/* Avatar with status ring */}
                          <div className="relative">
                            <Avatar className={cn(
                              "h-12 w-12 ring-2 transition-all",
                              isSelected ? "ring-primary" : "ring-transparent group-hover:ring-muted-foreground/30"
                            )}>
                              {space.icon_url ? (
                                <AvatarImage src={space.icon_url} />
                              ) : null}
                              <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30 text-primary font-bold">
                                {space.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {/* Online indicator */}
                            <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-background flex items-center justify-center">
                              <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                            </div>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={cn(
                                "font-semibold truncate",
                                isSelected && "text-primary"
                              )}>
                                {space.name}
                              </p>
                              {space.myRole === 'owner' && (
                                <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                              )}
                              {space.myRole === 'admin' && (
                                <Shield className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {memberCount} live
                              </span>
                              {unread > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground font-medium text-[10px]">
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expand arrow */}
                          <ChevronDown className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-180"
                          )} />
                        </div>

                        {/* Quick channels preview when expanded */}
                        <AnimatePresence>
                          {isExpanded && isSelected && channels.length > 0 && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-3 mt-3 border-t border-border/50 space-y-1">
                                {channels.slice(0, 4).map((channel) => (
                                  <button
                                    key={channel.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedChannelId(channel.id);
                                      setActiveTab('chat');
                                    }}
                                    className={cn(
                                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                                      selectedChannelId === channel.id
                                        ? "bg-primary/20 text-primary"
                                        : "hover:bg-muted/50 text-muted-foreground"
                                    )}
                                  >
                                    <Hash className="h-3.5 w-3.5" />
                                    <span className="truncate">{channel.name}</span>
                                    {(channelUnreads[channel.id] || 0) > 0 && (
                                      <span className="ml-auto text-[10px] bg-destructive text-destructive-foreground px-1.5 rounded-full">
                                        {channelUnreads[channel.id]}
                                      </span>
                                    )}
                                  </button>
                                ))}
                                {channels.length > 4 && (
                                  <p className="text-xs text-muted-foreground px-3 py-1">
                                    +{channels.length - 4} more channels
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    </motion.div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Quick Actions Footer */}
          <div className="p-4 border-t border-border/50 bg-card/50">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => setShowJoinDialog(true)}
                className="rounded-xl border-dashed"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Join
              </Button>
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
            </div>
          </div>
        </div>

        {/* Right Panel - Content */}
        <div className="hidden md:flex flex-1 flex-col min-w-0">
          {selectedSpace ? (
            <>
              {/* Header */}
              <div className="h-20 border-b border-border/50 bg-gradient-to-r from-card/80 to-transparent backdrop-blur-sm flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 ring-2 ring-primary/30">
                    {selectedSpace.icon_url ? (
                      <AvatarImage src={selectedSpace.icon_url} />
                    ) : null}
                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-bold text-lg">
                      {selectedSpace.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      {selectedSpace.name}
                      {selectedSpace.myRole === 'owner' && <Crown className="h-4 w-4 text-yellow-500" />}
                    </h2>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        {selectedSpaceLiveCount} members online
                      </span>
                      <span>•</span>
                      <span>{channels.length} channels</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(selectedSpace.myRole === 'owner' || selectedSpace.myRole === 'admin') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSettings(true)}
                      className="rounded-xl"
                    >
                      <Settings className="h-5 w-5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="rounded-xl">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex items-center gap-1 px-6 py-3 border-b border-border/50 bg-muted/20">
                {[
                  { id: 'chat', icon: MessageSquare, label: 'Chat' },
                  { id: 'feed', icon: Radio, label: 'Feed' },
                  { id: 'events', icon: Calendar, label: 'Events' },
                  { id: 'members', icon: Users, label: 'Members' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all relative",
                      activeTab === tab.id
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-primary/10 rounded-xl -z-10"
                        transition={{ type: 'spring', damping: 30 }}
                      />
                    )}
                    {tab.id === 'chat' && Object.values(channelUnreads).reduce((a, b) => a + b, 0) > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                        {Object.values(channelUnreads).reduce((a, b) => a + b, 0)}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  {activeTab === 'chat' && (
                    <motion.div
                      key="chat"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="h-full flex"
                    >
                      {/* Channel Sidebar */}
                      <div className="w-56 border-r border-border/50 p-3 bg-muted/10">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-2">
                          Channels
                        </p>
                        <div className="space-y-1">
                          {channels.map((channel) => (
                            <button
                              key={channel.id}
                              onClick={() => setSelectedChannelId(channel.id)}
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all",
                                selectedChannelId === channel.id
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Hash className="h-4 w-4" />
                              <span className="truncate">{channel.name}</span>
                              {(channelUnreads[channel.id] || 0) > 0 && (
                                <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded-full font-medium">
                                  {channelUnreads[channel.id]}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Chat Area */}
                      <div className="flex-1">
                        {selectedChannel ? (
                          <ChannelChat
                            channelId={selectedChannelId!}
                            channelName={selectedChannel.name}
                            serverId={selectedSpaceId!}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <div className="text-center">
                              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                                <Hash className="h-8 w-8 text-muted-foreground" />
                              </div>
                              <p className="text-muted-foreground">Select a channel</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'members' && (
                    <motion.div
                      key="members"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="h-full"
                    >
                      <ScrollArea className="h-full">
                        <div className="p-6">
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold">
                              Members ({selectedSpaceLiveCount})
                            </h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <div className="h-2 w-2 rounded-full bg-green-500" />
                              Live count
                            </div>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {members.map((member, index) => (
                              <motion.div
                                key={member.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                              >
                                <Link
                                  to={`/profile/${member.profile?.username || member.user_id}`}
                                  className="flex items-center gap-3 p-4 rounded-2xl bg-card/50 hover:bg-card transition-all group"
                                >
                                  <Avatar className="h-12 w-12 ring-2 ring-transparent group-hover:ring-primary/30 transition-all">
                                    <AvatarImage src={member.profile?.avatar_url || undefined} />
                                    <AvatarFallback>
                                      {member.profile?.username?.charAt(0)?.toUpperCase() || '?'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate flex items-center gap-2">
                                      {member.nickname || member.profile?.display_name || member.profile?.username}
                                      {member.role === 'owner' && <Crown className="h-3.5 w-3.5 text-yellow-500" />}
                                      {member.role === 'admin' && <Shield className="h-3.5 w-3.5 text-blue-500" />}
                                    </p>
                                    <p className="text-xs text-muted-foreground">@{member.profile?.username}</p>
                                  </div>
                                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Link>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      </ScrollArea>
                    </motion.div>
                  )}

                  {(activeTab === 'feed' || activeTab === 'events') && (
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="h-full flex items-center justify-center"
                    >
                      <div className="text-center">
                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4">
                          {activeTab === 'feed' ? (
                            <Radio className="h-10 w-10 text-primary" />
                          ) : (
                            <Calendar className="h-10 w-10 text-primary" />
                          )}
                        </div>
                        <h3 className="text-xl font-bold mb-2">
                          {activeTab === 'feed' ? 'Space Feed' : 'Events'}
                        </h3>
                        <p className="text-muted-foreground max-w-sm mb-6">
                          {activeTab === 'feed' 
                            ? 'Posts and updates from this space will appear here'
                            : 'Upcoming events for this space will appear here'
                          }
                        </p>
                        <Button className="rounded-xl">
                          <Plus className="h-4 w-4 mr-2" />
                          {activeTab === 'feed' ? 'Create Post' : 'Create Event'}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="h-12 w-12 text-primary" />
                </div>
                <h2 className="text-3xl font-bold mb-3">Welcome to Spaces</h2>
                <p className="text-muted-foreground mb-8">
                  Create your own community or join existing ones to connect with people who share your interests
                </p>
                <div className="flex gap-3 justify-center">
                  <Button 
                    onClick={() => setShowCreateDialog(true)} 
                    className="rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90 px-6"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Space
                  </Button>
                  <Button 
                    onClick={() => setShowJoinDialog(true)} 
                    variant="outline"
                    className="rounded-xl px-6"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Join Space
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile: Show content area */}
        <div className="flex-1 md:hidden">
          {selectedSpace && activeTab === 'chat' && selectedChannel && (
            <ChannelChat
              channelId={selectedChannelId!}
              channelName={selectedChannel.name}
              serverId={selectedSpaceId!}
            />
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
