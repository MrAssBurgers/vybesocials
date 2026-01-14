import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users, MessageSquare, Crown, Folder, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Server, ServerRole } from '@/hooks/useServers';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface ClassroomCardProps {
  server: Server & { myRole: ServerRole };
  unreadCount?: number;
  onClick: () => void;
  isSelected?: boolean;
}

// Color palette for cards - Google Classroom style
const cardColors = [
  { bg: 'bg-blue-600', gradient: 'from-blue-500 to-blue-700' },
  { bg: 'bg-emerald-600', gradient: 'from-emerald-500 to-emerald-700' },
  { bg: 'bg-purple-600', gradient: 'from-purple-500 to-purple-700' },
  { bg: 'bg-amber-600', gradient: 'from-amber-500 to-amber-700' },
  { bg: 'bg-rose-600', gradient: 'from-rose-500 to-rose-700' },
  { bg: 'bg-teal-600', gradient: 'from-teal-500 to-teal-700' },
  { bg: 'bg-indigo-600', gradient: 'from-indigo-500 to-indigo-700' },
  { bg: 'bg-cyan-600', gradient: 'from-cyan-500 to-cyan-700' },
];

function getCardColor(serverId: string) {
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
  const signedBanner = useSignedUrl(server.banner_url);
  const signedIcon = useSignedUrl(server.icon_url);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "relative cursor-pointer rounded-xl overflow-hidden bg-card shadow-md hover:shadow-xl transition-shadow",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      {/* Header banner */}
      <div 
        className={cn(
          "relative h-28 text-white overflow-hidden",
          !signedBanner && `bg-gradient-to-br ${cardColor.gradient}`
        )}
      >
        {signedBanner && (
          <img 
            src={signedBanner} 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="absolute right-0 top-0 h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <circle cx="80" cy="20" r="40" fill="white" />
            <circle cx="60" cy="80" r="25" fill="white" />
          </svg>
        </div>

        {/* Content overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

        {/* Server info on banner */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pr-16">
          <h3 className="font-bold text-lg truncate drop-shadow-md">{server.name}</h3>
          {server.description && (
            <p className="text-sm text-white/90 line-clamp-1 drop-shadow-sm">
              {server.description}
            </p>
          )}
        </div>

        {/* Avatar overlapping banner */}
        <div className="absolute -bottom-8 right-4">
          {signedIcon ? (
            <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-card shadow-lg bg-card">
              <img
                src={signedIcon}
                alt={server.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className={cn(
              "w-16 h-16 rounded-full border-4 border-card shadow-lg flex items-center justify-center text-white font-bold text-xl",
              `bg-gradient-to-br ${cardColor.gradient}`
            )}>
              {server.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Role badge */}
        {isOwner && (
          <div className="absolute top-3 left-3 bg-black/30 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-yellow-400" />
            <span className="text-xs font-medium">Owner</span>
          </div>
        )}

        {/* Unread badge */}
        {unreadCount > 0 && (
          <div className="absolute top-3 right-3 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 pt-3">
        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>{server.member_count || 0} members</span>
          </div>
        </div>

        {/* Action hint / divider */}
        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Folder className="h-4 w-4" />
            <span>Open community</span>
          </div>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
          <Users className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold mb-2">No communities yet</h3>
        <p className="text-muted-foreground text-sm max-w-sm mb-6">
          Create your first community or join an existing one to start connecting with others
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
