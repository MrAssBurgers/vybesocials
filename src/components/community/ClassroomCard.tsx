import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users, MessageSquare, Crown, Settings } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Server, ServerRole } from '@/hooks/useServers';

interface ClassroomCardProps {
  server: Server & { myRole: ServerRole };
  unreadCount?: number;
  onClick: () => void;
  isSelected?: boolean;
}

// Color palette for cards - Google Classroom style
const cardColors = [
  'from-blue-500 to-blue-600',
  'from-green-500 to-green-600',
  'from-purple-500 to-purple-600',
  'from-orange-500 to-orange-600',
  'from-pink-500 to-pink-600',
  'from-teal-500 to-teal-600',
  'from-indigo-500 to-indigo-600',
  'from-red-500 to-red-600',
];

function getCardColor(serverId: string): string {
  // Generate consistent color based on server ID
  let hash = 0;
  for (let i = 0; i < serverId.length; i++) {
    hash = serverId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % cardColors.length;
  return cardColors[index];
}

export const ClassroomCard = memo(function ClassroomCard({ 
  server, 
  unreadCount = 0, 
  onClick,
  isSelected = false 
}: ClassroomCardProps) {
  const cardColor = getCardColor(server.id);
  const isOwner = server.myRole === 'owner';
  const isAdmin = server.myRole === 'admin' || server.myRole === 'owner';

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "relative cursor-pointer rounded-2xl overflow-hidden shadow-lg",
        "transition-all duration-200",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      {/* Header banner */}
      <div className={cn(
        "relative h-24 bg-gradient-to-br text-white p-4",
        cardColor
      )}>
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-2 right-2 w-20 h-20 border-2 border-white rounded-full" />
          <div className="absolute bottom-2 left-4 w-12 h-12 border-2 border-white rounded-full" />
        </div>

        {/* Server info */}
        <div className="relative z-10">
          <h3 className="font-bold text-lg truncate pr-8">{server.name}</h3>
          {server.description && (
            <p className="text-sm text-white/80 line-clamp-1 mt-0.5">
              {server.description}
            </p>
          )}
        </div>

        {/* Role badge */}
        {isOwner && (
          <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm rounded-full p-1.5">
            <Crown className="h-4 w-4 text-yellow-300" />
          </div>
        )}

        {/* Unread badge */}
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 min-w-[24px] h-6 px-2 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="bg-card p-4">
        {/* Server icon overlapping banner */}
        <div className="relative -mt-10 mb-3">
          {server.icon_url ? (
            <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-card shadow-md bg-card">
              <img
                src={server.icon_url}
                alt={server.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className={cn(
              "w-16 h-16 rounded-full border-4 border-card shadow-md flex items-center justify-center text-white font-bold text-xl bg-gradient-to-br",
              cardColor
            )}>
              {server.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>{server.member_count || 0} members</span>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <Settings className="h-4 w-4" />
              <span>Admin</span>
            </div>
          )}
        </div>

        {/* Action hint */}
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            <span>Click to view channels</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

interface ClassroomGridProps {
  servers: (Server & { myRole: ServerRole })[];
  unreadCounts?: Record<string, number>;
  selectedServerId?: string | null;
  onSelectServer: (serverId: string) => void;
}

export const ClassroomGrid = memo(function ClassroomGrid({
  servers,
  unreadCounts = {},
  selectedServerId,
  onSelectServer
}: ClassroomGridProps) {
  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
          <Users className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No communities yet</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          Create or join a community to start chatting with others
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {servers.map((server) => (
        <ClassroomCard
          key={server.id}
          server={server}
          unreadCount={unreadCounts[server.id]}
          onClick={() => onSelectServer(server.id)}
          isSelected={selectedServerId === server.id}
        />
      ))}
    </div>
  );
});
