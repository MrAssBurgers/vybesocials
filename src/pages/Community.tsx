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
  Radio, MoreVertical, Share2, Bell, ChevronDown 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

// Server switcher dropdown in header
function ServerSwitcher({
  communities,
  selectedId,
  onSelect,
}: {
  communities: ReturnType<typeof useMyCommunities>['data'];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = (communities || []).find(c => c.id === selectedId);
  const selectedIcon = useSignedUrl(selected?.icon_url);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 hover:bg-foreground/5 rounded-lg px-2 py-1 transition-colors">
          <Avatar className="h-8 w-8 rounded-lg border border-foreground/10">
            {selectedIcon ? (
              <AvatarImage src={selectedIcon} alt={selected?.name} />
            ) : null}
            <AvatarFallback className="rounded-lg bg-primary/20 text-primary text-xs font-bold">
              {selected?.name?.slice(0, 2).toUpperCase() || '??'}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-card/95 backdrop-blur-md border border-border p-1" sideOffset={8}>
        {(communities || []).map((c) => (
          <ServerSwitcherItem key={c.id} community={c} isSelected={c.id === selectedId} onSelect={() => onSelect(c.id)} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ServerSwitcherItem({ community, isSelected, onSelect }: { community: any; isSelected: boolean; onSelect: () => void }) {
  const iconUrl = useSignedUrl(community.icon_url);
  return (
    <DropdownMenuItem
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer",
        isSelected && "bg-primary/10"
      )}
    >
      <Avatar className="h-7 w-7 rounded-lg">
        {iconUrl ? <AvatarImage src={iconUrl} alt={community.name} /> : null}
        <AvatarFallback className="rounded-lg bg-primary/20 text-primary text-[10px] font-bold">
          {community.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-sm font-medium">{community.name}</span>
      {isSelected && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
    </DropdownMenuItem>
  );
}

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

  const myCommunityIds = useMemo(() => new Set(communities.map(c => c.id)), [communities]);
  const filteredPublicCommunities = useMemo(() => 
    publicCommunities.filter(c => !myCommunityIds.has(c.id)),
    [publicCommunities, myCommunityIds]
  );

  // Auto-select first room when community changes
  useEffect(() => {
    if (selectedCommunityId && rooms.length > 0 && !selectedRoomId) {
      const chatRoom = rooms.find(r => r.room_type === 'chat') || rooms[0];
      if (chatRoom) setSelectedRoomId(chatRoom.id);
    }
  }, [selectedCommunityId, rooms, selectedRoomId]);

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCommunityId) params.set('community', selectedCommunityId);
    if (selectedRoomId) params.set('room', selectedRoomId);
    setSearchParams(params, { replace: true });
  }, [selectedCommunityId, selectedRoomId, setSearchParams]);

  // Update activity
  useEffect(() => {
    if (selectedCommunityId && profile?.id) {
      updateActivity.mutate({
        communityId: selectedCommunityId,
        activityType: selectedRoomId ? 'chatting' : 'browsing',
        roomId: selectedRoomId || undefined,
      });
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

  const handleSelectCommunity = useCallback((communityId: string) => {
    setSelectedCommunityId(communityId);
    setSelectedRoomId(null);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedCommunityId(null);
    setSelectedRoomId(null);
  }, []);

  const handleSwipeRoom = useCallback((direction: 'left' | 'right') => {
    if (!rooms.length || !selectedRoomId) return;
    const currentIndex = rooms.findIndex(r => r.id === selectedRoomId);
    if (currentIndex === -1) return;
    const newIndex = direction === 'left' 
      ? Math.min(currentIndex + 1, rooms.length - 1)
      : Math.max(currentIndex - 1, 0);
    if (newIndex !== currentIndex) setSelectedRoomId(rooms[newIndex].id);
  }, [rooms, selectedRoomId]);

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const myRole = communities.find(c => c.id === selectedCommunityId)?.myRole;

  // ── Community detail view ──
  if (selectedCommunityId && selectedCommunity) {
    return (
      <AppLayout hideRightSidebar fullWidth>
        <div className="h-[calc(100vh-5rem)] md:h-screen flex flex-col overflow-hidden bg-background">
          {/* Header with server switcher */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 bg-background/95 backdrop-blur-sm"
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToList}
              className="shrink-0 h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            
            {/* Server switcher */}
            <ServerSwitcher
              communities={communities}
              selectedId={selectedCommunityId}
              onSelect={handleSelectCommunity}
            />
            
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm truncate text-foreground">{selectedCommunity.name}</h2>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{selectedCommunity.member_count} members</span>
                {selectedCommunityLiveCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-green-400 flex items-center gap-1">
                      <Radio className="h-2.5 w-2.5 animate-pulse" />
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
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4 text-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="bg-card/95 backdrop-blur-md border border-border"
                sideOffset={8}
              >
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
          </motion.div>

          {/* Room tabs */}
          <RoomTabs
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
            unreadCounts={roomUnreadCounts}
          />

          {/* Room content with crossfade */}
          <SwipeableRoomContent
            onSwipeLeft={() => handleSwipeRoom('left')}
            onSwipeRight={() => handleSwipeRoom('right')}
          >
            <AnimatePresence mode="wait">
              {selectedRoom ? (
                <motion.div
                  key={selectedRoom.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <RoomChat
                    roomId={selectedRoom.id}
                    roomName={selectedRoom.name}
                    roomType={(selectedRoom.room_type || 'chat') as RoomType}
                    communityId={selectedCommunityId}
                  />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center h-full text-center p-8"
                >
                  <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-lg font-semibold mb-1">Welcome!</h2>
                  <p className="text-sm text-muted-foreground">Select a room above to start chatting</p>
                </motion.div>
              )}
            </AnimatePresence>
          </SwipeableRoomContent>

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

  // ── Community list view ──
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0"
            >
              <Users className="h-5 w-5 text-primary-foreground" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Communities</h1>
              <p className="text-xs text-muted-foreground">
                {communities.length} {communities.length === 1 ? 'community' : 'communities'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowJoinDialog(true)}
              className="gap-1.5 rounded-full text-xs h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Join</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="gap-1.5 rounded-full text-xs h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Create</span>
            </Button>
          </div>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'my' | 'discover')}>
          <TabsList className="w-full max-w-md rounded-full p-1 h-10">
            <TabsTrigger value="my" className="flex-1 gap-2 rounded-full text-sm">
              <Folder className="h-3.5 w-3.5" />
              My Communities
            </TabsTrigger>
            <TabsTrigger value="discover" className="flex-1 gap-2 rounded-full text-sm">
              <Globe className="h-3.5 w-3.5" />
              Discover
            </TabsTrigger>
          </TabsList>

          {/* My Communities */}
          <TabsContent value="my" className="mt-5">
            <AnimatePresence mode="wait">
              {communitiesLoading ? (
                <CommunityGridSkeleton />
              ) : communities.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-16"
                >
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4"
                  >
                    <Users className="h-10 w-10 text-muted-foreground" />
                  </motion.div>
                  <h3 className="text-xl font-semibold mb-2">No communities yet</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                    Join or create a community to connect with others
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('discover')}>
                      Discover
                    </Button>
                    <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                      Create One
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                  {communities.map((community, i) => (
                    <CommunityCard
                      key={community.id}
                      community={community}
                      onClick={() => handleSelectCommunity(community.id)}
                      unreadCount={unreadCounts[community.id]}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* Discover */}
          <TabsContent value="discover" className="mt-5 space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search communities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-10 rounded-full bg-foreground/5 border-0 text-sm"
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
                  <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <Globe className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">
                    {searchQuery ? 'No communities found' : 'No public communities yet'}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {searchQuery ? 'Try a different search' : 'Be the first to create one!'}
                  </p>
                </motion.div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                  {filteredPublicCommunities.map((community, i) => (
                    <PublicCommunityCard
                      key={community.id}
                      community={community}
                      onJoin={() => joinCommunity.mutate(community.invite_code)}
                      isJoining={joinCommunity.isPending}
                      index={i}
                    />
                  ))}
                </div>
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
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="rounded-2xl overflow-hidden bg-card/50"
        >
          <div className="h-28 bg-muted/50 animate-pulse" />
          <div className="p-3.5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-muted/50 animate-pulse -mt-8" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3.5 bg-muted/50 animate-pulse rounded w-2/3" />
                <div className="h-3 bg-muted/50 animate-pulse rounded w-1/2" />
              </div>
            </div>
            <div className="flex justify-between pt-1">
              <div className="h-3 bg-muted/50 animate-pulse rounded w-20" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
