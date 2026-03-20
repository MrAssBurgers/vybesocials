import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Settings, Hash, Volume2, ChevronDown, Users, Crown, Shield, DoorOpen } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMyServers, Server, ServerRole } from '@/hooks/useServers';
import { useUnreadCountPerServer } from '@/hooks/useServerNotifications';
import { CreateServerDialog } from './CreateServerDialog';
import { JoinServerDialog } from './JoinServerDialog';

interface ServerListProps {
  selectedServerId: string | null;
  onSelectServer: (serverId: string) => void;
}

export const ServerList = memo(function ServerList({ selectedServerId, onSelectServer }: ServerListProps) {
  const { data: servers = [], isLoading } = useMyServers();
  const { data: unreadCounts = {} } = useUnreadCountPerServer();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full w-[72px] bg-muted/30 border-r border-border py-3">
        <ScrollArea className="flex-1">
          <div className="flex flex-col items-center gap-2 px-3">
            {/* Server icons */}
            {servers.map((server) => (
              <ServerIcon
                key={server.id}
                server={server}
                isSelected={selectedServerId === server.id}
                onClick={() => onSelectServer(server.id)}
                unreadCount={unreadCounts[server.id] || 0}
              />
            ))}

            {/* Divider */}
            <div className="w-8 h-0.5 bg-border rounded-full my-1" />

            {/* Add server button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center",
                    "bg-muted hover:bg-primary hover:rounded-xl transition-all duration-200",
                    "text-muted-foreground hover:text-primary-foreground"
                  )}
                >
                  <Plus className="h-6 w-6" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Create Server</p>
              </TooltipContent>
            </Tooltip>

            {/* Join server button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowJoinDialog(true)}
                  className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center",
                    "bg-muted hover:bg-green-500 hover:rounded-xl transition-all duration-200",
                    "text-muted-foreground hover:text-white"
                  )}
                >
                  <DoorOpen className="h-6 w-6" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Join Server</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </ScrollArea>

        <CreateServerDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
        <JoinServerDialog open={showJoinDialog} onOpenChange={setShowJoinDialog} />
      </div>
    </TooltipProvider>
  );
});

// Individual server icon
const ServerIcon = memo(function ServerIcon({
  server,
  isSelected,
  onClick,
  unreadCount,
}: {
  server: Server & { myRole: ServerRole };
  isSelected: boolean;
  onClick: () => void;
  unreadCount: number;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className="relative group"
          >
            {/* Selection indicator */}
            <div
              className={cn(
                "absolute -left-3 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all",
                isSelected ? "h-10 bg-primary" : "h-0 group-hover:h-5 bg-primary"
              )}
            />
            
            {/* Server icon */}
            <div
              className={cn(
                "h-12 w-12 overflow-hidden transition-all duration-200",
                isSelected ? "rounded-xl" : "rounded-2xl group-hover:rounded-xl"
              )}
            >
              {server.icon_url ? (
                <img
                  src={server.icon_url}
                  alt={server.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-lg">
                  {server.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            {/* Unread badge */}
            {unreadCount > 0 && !isSelected && (
              <div className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center border-2 border-background">
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          <p>{server.name}</p>
          {server.myRole === 'owner' && <Crown className="h-3 w-3 text-yellow-500" />}
          {server.myRole === 'admin' && <Shield className="h-3 w-3 text-blue-500" />}
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">({unreadCount} new)</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
