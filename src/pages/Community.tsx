import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ServerList } from '@/components/community/ServerList';
import { ChannelSidebar } from '@/components/community/ChannelSidebar';
import { ChannelChat } from '@/components/community/ChannelChat';
import { useChannels } from '@/hooks/useServers';
import { MessageSquare } from 'lucide-react';

export default function Community() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    searchParams.get('server')
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    searchParams.get('channel')
  );

  const { data: channels = [] } = useChannels(selectedServerId || undefined);

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
    setSelectedChannelId(null); // Reset channel when switching servers
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <AppLayout hideRightSidebar fullWidth>
      <div className="h-[calc(100vh-5rem)] md:h-screen flex overflow-hidden bg-background">
        {/* Server list */}
        <ServerList
          selectedServerId={selectedServerId}
          onSelectServer={handleSelectServer}
        />

        {/* Channel sidebar - show when server selected */}
        {selectedServerId && (
          <ChannelSidebar
            serverId={selectedServerId}
            selectedChannelId={selectedChannelId}
            onSelectChannel={setSelectedChannelId}
          />
        )}

        {/* Main chat area */}
        <div className="flex-1 min-w-0">
          {selectedChannelId && selectedChannel ? (
            <ChannelChat
              channelId={selectedChannelId}
              channelName={selectedChannel.name}
              serverId={selectedServerId!}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageSquare className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                {selectedServerId ? 'Select a channel' : 'Welcome to Servers'}
              </h2>
              <p className="text-muted-foreground max-w-sm">
                {selectedServerId
                  ? 'Pick a channel from the sidebar to start chatting'
                  : 'Create or join a server to get started with your community'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
