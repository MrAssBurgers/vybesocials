import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { 
  useMyCommunities, 
  usePublicCommunities, 
  useCommunity, 
  useRooms, 
  useJoinCommunity,
  useUpdateActivity,
  RoomType,
} from '@/hooks/useCommunities';
import { useLiveMemberCount } from '@/hooks/useLiveMemberCount';
import { useUnreadCountPerServer, useUnreadCountPerChannel } from '@/hooks/useServerNotifications';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuth } from '@/lib/auth';
import { CommunityCard, PublicCommunityCard } from '@/components/community/CommunityCard';
import { RoomTabs, SwipeableRoomContent } from '@/components/community/RoomTabs';
import { RoomChat } from '@/components/community/RoomChat';
import { LivePanel } from '@/components/community/LivePanel';
import { MembersSheetTrigger } from '@/components/community/MembersPanel';
import { CreateServerDialog } from '@/components/community/CreateServerDialog';
import { JoinServerDialog } from '@/components/community/JoinServerDialog';
import { ServerSettingsSheet } from '@/components/community/ServerSettingsSheet';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { 
  Plus, Users, ArrowLeft, Settings, Search, Globe, Folder, 
  Radio, MoreVertical, Share2, Bell, BellOff 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export default function Community() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(
    searchParams.get('community') || searchParams.get('server')
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    searchParams.get('room') || searchParams.get('channel')
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'discover'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const { profile } = useAuth();
  const { data: communities = [], isLoading: communitiesLoading } = useMyCommunities();
  const { data: publicCommunities = [], isLoading: publicLoading } = usePublicCommunities(debouncedSearch);
  const { data: selectedCommunity } = useCommunity(selectedCommunityId || undefined);
  const { data: rooms = [] } = useRooms(selectedCommunityId || undefined);
  const { data: unreadCounts = {} } = useUnreadCountPerServer();
  const { data: roomUnreadCounts = {} } = useUnreadCountPerChannel(selectedCommunityId || undefined);
  const joinCommunity = useJoinCommunity();
  const updateActivity = useUpdateActivity();
  
  const selectedCommunityIcon = useSignedUrl(selectedCommunity?.icon_url);
  const selectedCommunityLiveCount = useLiveMemberCount(selectedCommunityId || undefined);

  // Filter out communities user is already in
  const myCommunityIds = useMemo(() => new Set(communities.map(c => c.id)), [communities]);
  const filteredPublicCommunities = useMemo(() => 
    publicCommunities.filter(c => !myCommunityIds.has(c.id)),
    [publicCommunities, myCommunityIds]
  );

  // Auto-select first room when community changes
  useEffect(() => {
    if (selectedCommunityId && rooms.length > 0 && !selectedRoomId) {
      const chatRoom = rooms.find(r => r.room_type === 'chat') || rooms[0];
      if (chatRoom) {
        setSelectedRoomId(chatRoom.id);
      }
    }
  }, [selectedCommunityId, rooms, selectedRoomId]);

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCommunityId) params.set('community', selectedCommunityId);
    if (selectedRoomId) params.set('room', selectedRoomId);
    setSearchParams(params, { replace: true });
  }, [selectedCommunityId, selectedRoomId, setSearchParams]);

  // Update activity when browsing
  useEffect(() => {
    if (selectedCommunityId && profile?.id) {
      updateActivity.mutate({
        communityId: selectedCommunityId,
        activityType: selectedRoomId ? 'chatting' : 'browsing',
        roomId: selectedRoomId || undefined,
      });

      // Heartbeat every 2 minutes
      const interval = setInterval(() => {
        updateActivity.mutate({
          communityId: selectedCommunityId,
          activityType: selectedRoomId ? 'chatting' : 'browsing',
          roomId: selectedRoomId || undefined,
        });
      }, 2 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [selectedCommunityId, selectedRoomId, profile?.id]);

  const handleSelectCommunity = (communityId: string) => {
    setSelectedCommunityId(communityId);
    setSelectedRoomId(null);
  };

  const handleBackToList = () => {
    setSelectedCommunityId(null);
    setSelectedRoomId(null);
  };

  const handleSwipeRoom = useCallback((direction: 'left' | 'right') => {
    if (!rooms.length || !selectedRoomId) return;
    
    const currentIndex = rooms.findIndex(r => r.id === selectedRoomId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'left' 
      ? Math.min(currentIndex + 1, rooms.length - 1)
      : Math.max(currentIndex - 1, 0);
    
    if (newIndex !== currentIndex) {
      setSelectedRoomId(rooms[newIndex].id);
    }
  }, [rooms, selectedRoomId]);

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const myRole = communities.find(c => c.id === selectedCommunityId)?.myRole;

  // Community detail view
  if (selectedCommunityId && selectedCommunity) {
    return (
      <AppLayout hideRightSidebar fullWidth>
        <div className="h-[calc(100vh-5rem)] md:h-screen flex flex-col overflow-hidden bg-background">
          {/* Community header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToList}
              className="shrink-0 h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <Avatar className="h-10 w-10 rounded-xl border border-foreground/10">
              {selectedCommunityIcon ? (
                <AvatarImage src={selectedCommunityIcon} alt={selectedCommunity.name} />
              ) : null}
              <AvatarFallback className="rounded-xl bg-primary text-primary-foreground font-semibold">
                {selectedCommunity.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold truncate text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{selectedCommunity.name}</h2>
              <div className="flex items-center gap-2 text-xs text-foreground/80">
                <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{selectedCommunity.member_count} members</span>
                {selectedCommunityLiveCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-green-400 flex items-center gap-1">
                      <Radio className="h-3 w-3 animate-pulse" />
                      {selectedCommunityLiveCount} active
                    </span>
                  </>
                )}
              </div>
            </div>

            <MembersSheetTrigger 
              communityId={selectedCommunityId} 
              memberCount={selectedCommunity.member_count} 
            />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  navigator.clipboard.writeText(selectedCommunity.invite_code);
                  toast.success('Invite code copied!');
                }}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Invite
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bell className="h-4 w-4 mr-2" />
                  Notifications
                </DropdownMenuItem>
                {(myRole === 'owner' || myRole === 'moderator') && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowSettings(true)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Room tabs */}
          <RoomTabs
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
            unreadCounts={roomUnreadCounts}
          />

          {/* Room content */}
          <SwipeableRoomContent
            onSwipeLeft={() => handleSwipeRoom('left')}
            onSwipeRight={() => handleSwipeRoom('right')}
          >
            {selectedRoom ? (
              <RoomChat
                roomId={selectedRoom.id}
                roomName={selectedRoom.name}
                roomType={(selectedRoom.room_type || 'chat') as RoomType}
                communityId={selectedCommunityId}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Users className="h-10 w-10 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Welcome!</h2>
                <p className="text-muted-foreground max-w-sm">
                  Select a room above to start chatting
                </p>
              </div>
            )}
          </SwipeableRoomContent>

          {/* Live panel - only show on Live room */}
          {selectedRoom?.room_type === 'live' && (
            <div className="p-4 border-t border-border/50">
              <LivePanel communityId={selectedCommunityId} />
            </div>
          )}
        </div>

        {selectedCommunityId && myRole && (
          <ServerSettingsSheet
            serverId={selectedCommunityId}
            myRole={myRole === 'moderator' ? 'admin' : myRole}
            open={showSettings}
            onOpenChange={setShowSettings}
            onServerDeleted={handleBackToList}
          />
        )}
      </AppLayout>
    );
  }

  // Community list view
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">Communities</h1>
              <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {communities.length} {communities.length === 1 ? 'community' : 'communities'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowJoinDialog(true)}
              className="gap-2 rounded-full"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Join</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="gap-2 rounded-full"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create</span>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'my' | 'discover')}>
          <TabsList className="w-full max-w-md rounded-full p-1 h-11">
            <TabsTrigger value="my" className="flex-1 gap-2 rounded-full">
              <Folder className="h-4 w-4" />
              My Communities
            </TabsTrigger>
            <TabsTrigger value="discover" className="flex-1 gap-2 rounded-full">
              <Globe className="h-4 w-4" />
              Discover
            </TabsTrigger>
          </TabsList>

          {/* My Communities */}
          <TabsContent value="my" className="mt-6">
            <AnimatePresence mode="wait">
              {communitiesLoading ? (
                <CommunityGridSkeleton />
              ) : communities.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-16"
                >
                  <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Users className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No communities yet</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Join or create a community to connect with others
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button variant="outline" onClick={() => setActiveTab('discover')}>
                      Discover
                    </Button>
                    <Button onClick={() => setShowCreateDialog(true)}>
                      Create One
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                >
                  {communities.map((community) => (
                    <CommunityCard
                      key={community.id}
                      community={community}
                      onClick={() => handleSelectCommunity(community.id)}
                      unreadCount={unreadCounts[community.id]}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* Discover */}
          <TabsContent value="discover" className="mt-6 space-y-4">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search communities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-11 rounded-full bg-foreground/5 border-0"
              />
            </div>

            <AnimatePresence mode="wait">
              {publicLoading ? (
                <CommunityGridSkeleton />
              ) : filteredPublicCommunities.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-16"
                >
                  <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Globe className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">
                    {searchQuery ? 'No communities found' : 'No public communities yet'}
                  </h3>
                  <p className="text-muted-foreground">
                    {searchQuery ? 'Try a different search' : 'Be the first to create one!'}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                >
                  {filteredPublicCommunities.map((community) => (
                    <PublicCommunityCard
                      key={community.id}
                      community={community}
                      onJoin={() => joinCommunity.mutate(community.invite_code)}
                      isJoining={joinCommunity.isPending}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </div>

      <CreateServerDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <JoinServerDialog open={showJoinDialog} onOpenChange={setShowJoinDialog} />
    </AppLayout>
  );
}

// Skeleton loader
function CommunityGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-card">
          <div className="h-32 bg-muted animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted animate-pulse -mt-8" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
              </div>
            </div>
            <div className="flex justify-between pt-1">
              <div className="h-3 bg-muted animate-pulse rounded w-20" />
              <div className="h-8 bg-muted animate-pulse rounded-full w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
