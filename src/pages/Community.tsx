import { useCommunityRequest } from '@/hooks/useCommunityRequest';
import { useAuth } from '@/lib/auth';
import { useCommunityMutation } from '@/hooks/useCommunityMutation';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  useMyCommunities,
  usePublicCommunities,
  useCommunity,
  useRooms,
  useJoinCommunity,
} from '@/hooks/useCommunities';
import { useUnreadCountPerServer } from '@/hooks/useServerNotifications';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { CommunityCard, PublicCommunityCard } from '@/components/community/CommunityCard';
import { CommunityShell } from '@/components/community/CommunityShell';
import { CreateServerDialog } from '@/components/community/CreateServerDialog';
import { JoinServerDialog } from '@/components/community/JoinServerDialog';
import { CommunityOrbitBar } from '@/components/community/CommunityOrbitBar';
import {
  Plus,
  Users,
  Search,
  Globe,
  Folder,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function Community() {
  const accountId = useAuth().user?.id;
  return <CommunityAccountView key={accountId || 'signed-out'} />;
}

function CommunityAccountView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(
    searchParams.get('community') || searchParams.get('server'),
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    searchParams.get('room') || searchParams.get('channel'),
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [inviteFromLink] = useState(() => searchParams.get('join') || '');
  const [showJoinDialog, setShowJoinDialog] = useState(() => !!searchParams.get('join'));
  const [activeTab, setActiveTab] = useState<'my' | 'discover'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const { data: communities = [], isLoading: communitiesLoading } = useMyCommunities();
  const { data: publicCommunities = [], isLoading: publicLoading } = usePublicCommunities(debouncedSearch);
  const { data: selectedCommunity } = useCommunity(selectedCommunityId || undefined);
  const { data: rooms = [] } = useRooms(selectedCommunityId || undefined);
  const { data: unreadCounts = {} } = useUnreadCountPerServer();
  const joinCommunity = useJoinCommunity();

  const myCommunityIds = useMemo(() => new Set(communities.map((c) => c.id)), [communities]);
  const filteredPublicCommunities = useMemo(
    () => publicCommunities.filter((c) => !myCommunityIds.has(c.id)),
    [publicCommunities, myCommunityIds],
  );

  useEffect(() => {
    if (selectedCommunityId && rooms.length > 0 && !selectedRoomId) {
      const chatRoom = rooms.find((r) => r.room_type === 'chat') || rooms[0];
      if (chatRoom) setSelectedRoomId(chatRoom.id);
    }
  }, [selectedCommunityId, rooms, selectedRoomId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCommunityId) params.set('community', selectedCommunityId);
    if (selectedRoomId) params.set('room', selectedRoomId);
    setSearchParams(params, { replace: true });
  }, [selectedCommunityId, selectedRoomId, setSearchParams]);

  const handleSelectCommunity = useCallback((communityId: string) => {
    setSelectedCommunityId(communityId);
    setSelectedRoomId(null);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedCommunityId(null);
    setSelectedRoomId(null);
  }, []);

  const myRole = communities.find((c) => c.id === selectedCommunityId)?.myRole;
  const needsRecovery = communities.find((c) => c.id === selectedCommunityId)?.requiresRecovery;

  if (selectedCommunityId && needsRecovery) {
    return <AppLayout><CommunityRecovery serverId={selectedCommunityId} onBack={handleBackToList} /></AppLayout>;
  }

  if (selectedCommunityId && selectedCommunity) {
    return (
      <TooltipProvider delayDuration={300}>
        <AppLayout hideRightSidebar fullWidth noPadding hideNav>
          <CommunityShell
            communities={communities}
            selectedCommunity={selectedCommunity}
            selectedCommunityId={selectedCommunityId}
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onSelectCommunity={handleSelectCommunity}
            onSelectRoom={setSelectedRoomId}
            onBackToList={handleBackToList}
            onBackToDiscover={handleBackToList}
            onCreateCommunity={() => setShowCreateDialog(true)}
            serverUnreadCounts={unreadCounts}
            myRole={myRole}
          />
          <CreateServerDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
        </AppLayout>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <AppLayout hideRightSidebar fullWidth noPadding>
        <div className="community-shell h-full flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 pt-[calc(var(--sat,0px)+0.75rem)] pb-2 border-b border-foreground/8">
            <CommunityOrbitBar
              communities={communities}
              selectedId={null}
              onSelect={handleSelectCommunity}
              onCreate={() => setShowCreateDialog(true)}
              onDiscover={() => setActiveTab('discover')}
              unreadCounts={unreadCounts}
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-6">
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className="community-list-hero rounded-2xl p-6 md:p-8 relative overflow-hidden"
              >
                <div className="absolute inset-0 home-hero-grid pointer-events-none opacity-30" />
                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-[0_0_24px_hsl(var(--primary)/0.35)]">
                      <Users className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary" />
                        VYBE Communities
                      </p>
                      <h1 className="text-2xl md:text-3xl font-black community-title-gradient">
                        Your servers, your vibe
                      </h1>
                      <p className="text-sm text-muted-foreground mt-1 max-w-md">
                        Your crews, your channels — text lounges, voice hangouts, and live energy in one iconic shell.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowJoinDialog(true)}
                      className="gap-1.5 rounded-full"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Join
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowCreateDialog(true)}
                      className="gap-1.5 rounded-full shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create
                    </Button>
                  </div>
                </div>
              </motion.div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'my' | 'discover')}>
                <TabsList className="w-full max-w-md rounded-full p-1 h-10 bg-foreground/5">
                  <TabsTrigger value="my" className="flex-1 gap-2 rounded-full text-sm">
                    <Folder className="h-3.5 w-3.5" />
                    My Communities
                  </TabsTrigger>
                  <TabsTrigger value="discover" className="flex-1 gap-2 rounded-full text-sm">
                    <Globe className="h-3.5 w-3.5" />
                    Discover
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="my" className="mt-5">
                  <AnimatePresence mode="wait">
                    {communitiesLoading && communities.length === 0 ? (
                      <CommunityGridSkeleton />
                    ) : communities.length === 0 ? (
                      <CommunityEmptyPanel
                        icon={Users}
                        title="No communities yet"
                        description="Join or create a community to connect with others"
                        primaryLabel="Create One"
                        onPrimary={() => setShowCreateDialog(true)}
                        secondaryLabel="Discover"
                        onSecondary={() => setActiveTab('discover')}
                      />
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

                <TabsContent value="discover" className="mt-5 space-y-4">
                  <div className="relative max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search communities..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-11 h-10 rounded-full bg-foreground/5 border-foreground/10 text-sm"
                    />
                  </div>

                  <AnimatePresence mode="wait">
                    {publicLoading && filteredPublicCommunities.length === 0 ? (
                      <CommunityGridSkeleton />
                    ) : filteredPublicCommunities.length === 0 ? (
                      <CommunityEmptyPanel
                        icon={Globe}
                        title={searchQuery ? 'No communities found' : 'No public communities yet'}
                        description={searchQuery ? 'Try a different search' : 'Be the first to create one!'}
                      />
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                        {filteredPublicCommunities.map((community, i) => (
                          <PublicCommunityCard
                            key={community.id}
                            community={community}
                            onJoin={() => joinCommunity.mutate({ serverId: community.id }, { onSuccess: joined => handleSelectCommunity(joined.id) })}
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
          </div>
        </div>

        <CreateServerDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
        <JoinServerDialog open={showJoinDialog} onOpenChange={setShowJoinDialog} initialCode={inviteFromLink} onJoined={handleSelectCommunity} />
      </AppLayout>
    </TooltipProvider>
  );
}

function CommunityRecovery({ serverId, onBack }: { serverId: string; onBack: () => void }) {
  const communityRequest = useCommunityRequest();
  const client = useQueryClient();
  const recovery = useCommunityMutation({
    mutationFn: () => communityRequest('community-manage', { action: 'recoverOwner', serverId }),
    onSuccess: async () => {
      await Promise.all(['my-communities', 'my-servers', 'community', 'server', 'rooms', 'channels'].map(key => client.invalidateQueries({ queryKey: [key] })));
      toast.success('Community restored. Share its new invitation with your members.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return <div className="max-w-lg mx-auto p-6 space-y-4">
    <h1 className="text-xl font-semibold">Restore your community</h1>
    <p className="text-sm text-muted-foreground">Your rooms and messages are preserved. Restore access to create a fresh invitation, then invite your members back. Previous member roles need to be assigned again.</p>
    <Button disabled={recovery.isPending} onClick={() => recovery.mutate()}>{recovery.isPending ? 'Restoring…' : 'Restore community access'}</Button>
    <Button variant="ghost" onClick={onBack}>Back to communities</Button>
  </div>;
}

function CommunityEmptyPanel({
  icon: Icon,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-16"
    >
      <div className="community-welcome-icon mx-auto mb-4">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">{description}</p>
      {(primaryLabel || secondaryLabel) && (
        <div className="flex justify-center gap-3">
          {secondaryLabel && onSecondary && (
            <Button variant="outline" size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
          {primaryLabel && onPrimary && (
            <Button size="sm" onClick={onPrimary}>
              {primaryLabel}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function CommunityGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="rounded-2xl overflow-hidden bg-card/50 skeleton-shimmer"
        >
          <Skeleton className="h-28 w-full rounded-none" animate={false} />
          <div className="p-3.5 space-y-3">
            <div className="flex items-start gap-3">
              <Skeleton className="w-11 h-11 rounded-xl -mt-8 shrink-0" animate={false} />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-3.5 w-2/3" animate={false} />
                <Skeleton className="h-3 w-1/2" animate={false} />
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
