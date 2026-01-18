import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChannelSidebar } from '@/components/community/ChannelSidebar';
import { ChannelChat } from '@/components/community/ChannelChat';
import { ClassroomGrid } from '@/components/community/ClassroomCard';
import { CreateServerDialog } from '@/components/community/CreateServerDialog';
import { JoinServerDialog } from '@/components/community/JoinServerDialog';
import { useMyServers, useChannels, useServer, usePublicServers, useJoinServer } from '@/hooks/useServers';
import { useLiveMemberCount } from '@/hooks/useLiveMemberCount';
import { useUnreadCountPerServer } from '@/hooks/useServerNotifications';
import { Plus, Users, ArrowLeft, Settings, UserPlus, Hash, Search, Globe, Folder, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ServerSettingsSheet } from '@/components/community/ServerSettingsSheet';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function Community() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    searchParams.get('server')
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    searchParams.get('channel')
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'public'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const { profile } = useAuth();
  const { data: servers = [], isLoading: serversLoading } = useMyServers();
  const { data: publicServers = [], isLoading: publicServersLoading } = usePublicServers(debouncedSearch);
  const { data: selectedServer } = useServer(selectedServerId || undefined);
  const selectedServerLiveCount = useLiveMemberCount(selectedServerId || undefined);
  const { data: channels = [] } = useChannels(selectedServerId || undefined);
  const { data: unreadCounts = {} } = useUnreadCountPerServer();
  const joinServer = useJoinServer();
  
  const serverIconUrl = useSignedUrl(selectedServer?.icon_url);

  // Filter public servers to exclude servers user is already a member of
  const myServerIds = useMemo(() => new Set(servers.map(s => s.id)), [servers]);
  const filteredPublicServers = useMemo(() => 
    publicServers.filter(s => !myServerIds.has(s.id)),
    [publicServers, myServerIds]
  );

  // Auto-select first channel when server changes
  useEffect(() => {
    if (selectedServerId && channels.length > 0 && !selectedChannelId) {
      const firstTextChannel = channels.find(c => c.type === 'text');
      if (firstTextChannel) {
        setSelectedChannelId(firstTextChannel.id);
      }
    }
  }, [selectedServerId, channels, selectedChannelId]);

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedServerId) params.set('server', selectedServerId);
    if (selectedChannelId) params.set('channel', selectedChannelId);
    setSearchParams(params, { replace: true });
  }, [selectedServerId, selectedChannelId, setSearchParams]);

  const handleSelectServer = (serverId: string) => {
    setSelectedServerId(serverId);
    setSelectedChannelId(null);
  };

  const handleBackToGrid = () => {
    setSelectedServerId(null);
    setSelectedChannelId(null);
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);
  const myRole = servers.find(s => s.id === selectedServerId)?.myRole;

  // Show server chat view when a server is selected
  if (selectedServerId) {
    return (
      <AppLayout hideRightSidebar fullWidth>
        <div className="h-[calc(100vh-5rem)] md:h-screen flex flex-col overflow-hidden bg-background">
          {/* Server header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-card/50 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToGrid}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            {selectedServer && (
              <>
                <Avatar className="h-10 w-10 border-2 border-primary/20">
                  {serverIconUrl ? (
                    <AvatarImage src={serverIconUrl} alt={selectedServer.name} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                    {selectedServer.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold truncate">{selectedServer.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedServerLiveCount} members
                  </p>
                </div>
              </>
            )}
            
            {(myRole === 'owner' || myRole === 'admin') && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-5 w-5" />
              </Button>
            )}
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Channel sidebar */}
            <ChannelSidebar
              serverId={selectedServerId}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
            />

            {/* Main chat area */}
            <div className="flex-1 min-w-0">
              {selectedChannelId && selectedChannel ? (
                <ChannelChat
                  channelId={selectedChannelId}
                  channelName={selectedChannel.name}
                  serverId={selectedServerId}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Hash className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Select a channel</h2>
                  <p className="text-muted-foreground max-w-sm">
                    Pick a channel from the sidebar to start chatting
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedServerId && myRole && (
          <ServerSettingsSheet
            serverId={selectedServerId}
            myRole={myRole}
            open={showSettings}
            onOpenChange={setShowSettings}
            onServerDeleted={handleBackToGrid}
          />
        )}
      </AppLayout>
    );
  }

  // Show classroom-style grid when no server is selected
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
              <h1 className="text-2xl font-bold">Communities</h1>
              <p className="text-sm text-muted-foreground">
                {servers.length} {servers.length === 1 ? 'community' : 'communities'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowJoinDialog(true)}
              className="gap-2"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Join</span>
            </Button>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create</span>
            </Button>
          </div>
        </div>

        {/* Tabs for My Servers / Public Servers */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'my' | 'public')}>
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="my" className="flex-1 gap-2">
              <Folder className="h-4 w-4" />
              My Communities
            </TabsTrigger>
            <TabsTrigger value="public" className="flex-1 gap-2">
              <Globe className="h-4 w-4" />
              Discover
            </TabsTrigger>
          </TabsList>

          {/* My Servers Tab */}
          <TabsContent value="my" className="mt-6">
            {serversLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden">
                    <div className="h-24 bg-muted animate-pulse" />
                    <div className="bg-card p-4 space-y-3">
                      <div className="w-16 h-16 -mt-12 rounded-full bg-muted animate-pulse border-4 border-card" />
                      <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                      <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : servers.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No communities yet</h3>
                <p className="text-muted-foreground mb-4">Join or create a community to get started</p>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" onClick={() => setActiveTab('public')}>
                    Discover Communities
                  </Button>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    Create One
                  </Button>
                </div>
              </div>
            ) : (
              <ClassroomGrid
                servers={servers}
                unreadCounts={unreadCounts}
                selectedServerId={selectedServerId}
                onSelectServer={handleSelectServer}
              />
            )}
          </TabsContent>

          {/* Public Servers Tab */}
          <TabsContent value="public" className="mt-6 space-y-4">
            {/* Search Bar */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search public communities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {publicServersLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden">
                    <div className="h-24 bg-muted animate-pulse" />
                    <div className="bg-card p-4 space-y-3">
                      <div className="w-16 h-16 -mt-12 rounded-full bg-muted animate-pulse border-4 border-card" />
                      <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                      <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPublicServers.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Globe className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery ? 'No communities found' : 'No public communities available'}
                </h3>
                <p className="text-muted-foreground">
                  {searchQuery ? 'Try a different search term' : 'Be the first to create a public community!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPublicServers.map((server) => (
                  <PublicServerCard
                    key={server.id}
                    server={server}
                    onJoin={() => joinServer.mutate(server.invite_code)}
                    isJoining={joinServer.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateServerDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <JoinServerDialog open={showJoinDialog} onOpenChange={setShowJoinDialog} />
    </AppLayout>
  );
}

// Public server card component
function PublicServerCard({ 
  server, 
  onJoin, 
  isJoining 
}: { 
  server: { id: string; name: string; description: string | null; icon_url: string | null; member_count: number };
  onJoin: () => void;
  isJoining: boolean;
}) {
  const iconUrl = useSignedUrl(server.icon_url);
  
  return (
    <div className="rounded-2xl overflow-hidden border bg-card hover:shadow-lg transition-shadow">
      {/* Banner placeholder */}
      <div className="h-20 bg-gradient-to-br from-primary/20 to-primary/5" />
      
      <div className="p-4 space-y-3">
        {/* Server icon */}
        <Avatar className="h-14 w-14 -mt-10 border-4 border-card">
          {iconUrl ? (
            <AvatarImage src={iconUrl} alt={server.name} />
          ) : null}
          <AvatarFallback className="bg-primary text-primary-foreground font-bold text-lg">
            {server.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Server info */}
        <div>
          <h3 className="font-semibold truncate">{server.name}</h3>
          {server.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {server.description}
            </p>
          )}
        </div>
        
        {/* Member count and join button */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            {server.member_count} {server.member_count === 1 ? 'member' : 'members'}
          </span>
          <Button size="sm" onClick={onJoin} disabled={isJoining}>
            {isJoining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Join'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
