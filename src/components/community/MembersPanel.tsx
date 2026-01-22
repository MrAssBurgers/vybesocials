import { memo, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Crown, Shield, MessageCircle, Phone, User, ChevronDown, Search } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useCommunityMembers, useLiveActivity, CommunityMember } from '@/hooks/useCommunities';
import { useNavigate } from 'react-router-dom';

interface MembersPanelProps {
  communityId: string;
}

const roleIcons = {
  owner: Crown,
  moderator: Shield,
  member: User,
};

const roleColors = {
  owner: 'text-amber-400',
  moderator: 'text-blue-400',
  member: 'text-muted-foreground',
};

export const MembersPanel = memo(function MembersPanel({ communityId }: MembersPanelProps) {
  const navigate = useNavigate();
  const { data: members = [], isLoading } = useCommunityMembers(communityId);
  const { data: activity = [] } = useLiveActivity(communityId);
  const [search, setSearch] = useState('');

  // Get active user IDs
  const activeUserIds = useMemo(() => 
    new Set(activity.map(a => a.user_id)),
    [activity]
  );

  // Filter and sort members
  const filteredMembers = useMemo(() => {
    let filtered = members;
    
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = members.filter(m => 
        m.profile?.username?.toLowerCase().includes(searchLower) ||
        m.profile?.display_name?.toLowerCase().includes(searchLower)
      );
    }

    // Sort: owners first, then mods, then active members, then inactive
    return filtered.sort((a, b) => {
      const roleOrder = { owner: 0, moderator: 1, member: 2 };
      const roleCompare = roleOrder[a.role] - roleOrder[b.role];
      if (roleCompare !== 0) return roleCompare;
      
      const aActive = activeUserIds.has(a.user_id);
      const bActive = activeUserIds.has(b.user_id);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      
      return 0;
    });
  }, [members, search, activeUserIds]);

  const handleMessage = (userId: string) => {
    // Navigate to DM with this user
    navigate(`/messages?user=${userId}`);
  };

  const handleCall = (userId: string) => {
    // Start call with this user
    navigate(`/messages?user=${userId}&call=true`);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-9 rounded-full bg-foreground/5"
        />
      </div>

      {/* Member count */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        </span>
        <span className="text-green-400 text-xs flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          {activeUserIds.size} online
        </span>
      </div>

      {/* Members list */}
      <div className="space-y-1 max-h-[400px] overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="popLayout">
          {filteredMembers.map((member, index) => (
            <MemberItem
              key={member.id}
              member={member}
              isActive={activeUserIds.has(member.user_id)}
              activityType={activity.find(a => a.user_id === member.user_id)?.activity_type}
              onMessage={() => handleMessage(member.user_id)}
              onCall={() => handleCall(member.user_id)}
              delay={index * 0.02}
            />
          ))}
        </AnimatePresence>

        {filteredMembers.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No members found
          </div>
        )}
      </div>
    </div>
  );
});

// Individual member item
const MemberItem = memo(function MemberItem({
  member,
  isActive,
  activityType,
  onMessage,
  onCall,
  delay = 0,
}: {
  member: CommunityMember;
  isActive: boolean;
  activityType?: string;
  onMessage: () => void;
  onCall: () => void;
  delay?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const RoleIcon = roleIcons[member.role] || User;
  const roleColor = roleColors[member.role] || 'text-muted-foreground';

  const activityLabels: Record<string, string> = {
    live: 'Going live',
    listening: 'Listening',
    chatting: 'Chatting',
    browsing: 'Active now',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ delay }}
      className="group"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-foreground/5 transition-colors"
      >
        {/* Avatar with status */}
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarImage src={member.profile?.avatar_url || undefined} />
            <AvatarFallback>
              {(member.profile?.display_name || member.profile?.username)?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          {/* Online indicator */}
          <span className={cn(
            "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
            isActive ? "bg-green-500" : "bg-muted"
          )} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">
              {member.profile?.display_name || member.profile?.username}
            </span>
            <RoleIcon className={cn("h-3.5 w-3.5 shrink-0", roleColor)} />
          </div>
          
          {isActive && activityType && (
            <p className="text-xs text-green-400">
              {activityLabels[activityType] || 'Active'}
            </p>
          )}
        </div>

        {/* Quick actions (visible on hover/expanded) */}
        <div className={cn(
          "flex items-center gap-1 transition-opacity",
          expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onMessage();
            }}
          >
            <MessageCircle className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onCall();
            }}
          >
            <Phone className="h-4 w-4" />
          </Button>
        </div>
      </button>
    </motion.div>
  );
});

// Mobile-friendly members sheet trigger
export const MembersSheetTrigger = memo(function MembersSheetTrigger({
  communityId,
  memberCount,
}: {
  communityId: string;
  memberCount: number;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          <span>{memberCount}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[320px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <MembersPanel communityId={communityId} />
        </div>
      </SheetContent>
    </Sheet>
  );
});
