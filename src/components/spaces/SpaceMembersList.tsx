/**
 * SpaceMembersList - Clean grid/list of Space members
 * With presence status and quick actions
 */

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  MessageSquare, 
  Phone, 
  User,
  Crown,
  Shield,
  MoreHorizontal,
  Search
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface SpaceMember {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  role: 'owner' | 'moderator' | 'member';
  isOnline?: boolean;
  joinedAt?: string;
}

interface SpaceMembersListProps {
  members: SpaceMember[];
  currentUserId?: string;
  onMessage?: (userId: string) => void;
  onCall?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
  className?: string;
}

const roleConfig = {
  owner: { 
    icon: Crown, 
    label: 'Owner',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/20'
  },
  moderator: { 
    icon: Shield, 
    label: 'Moderator',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/20'
  },
  member: { 
    icon: User, 
    label: 'Member',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted'
  },
};

export const SpaceMembersList = memo(function SpaceMembersList({
  members,
  currentUserId,
  onMessage,
  onCall,
  onViewProfile,
  className,
}: SpaceMembersListProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredMembers = members.filter(m => 
    m.username.toLowerCase().includes(search.toLowerCase()) ||
    m.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  // Sort by role priority, then by online status, then alphabetically
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const rolePriority = { owner: 0, moderator: 1, member: 2 };
    if (rolePriority[a.role] !== rolePriority[b.role]) {
      return rolePriority[a.role] - rolePriority[b.role];
    }
    if (a.isOnline !== b.isOnline) {
      return a.isOnline ? -1 : 1;
    }
    return (a.displayName || a.username).localeCompare(b.displayName || b.username);
  });

  // Group by role
  const owners = sortedMembers.filter(m => m.role === 'owner');
  const moderators = sortedMembers.filter(m => m.role === 'moderator');
  const regularMembers = sortedMembers.filter(m => m.role === 'member');

  const onlineCount = members.filter(m => m.isOnline).length;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Members</h3>
            <p className="text-xs text-muted-foreground">
              {onlineCount} online • {members.length} total
            </p>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-muted/50 border-0"
          />
        </div>
      </div>

      {/* Members list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Owners */}
          {owners.length > 0 && (
            <MemberSection
              title="Owner"
              members={owners}
              currentUserId={currentUserId}
              onMessage={onMessage}
              onCall={onCall}
              onViewProfile={onViewProfile}
            />
          )}

          {/* Moderators */}
          {moderators.length > 0 && (
            <MemberSection
              title="Moderators"
              members={moderators}
              currentUserId={currentUserId}
              onMessage={onMessage}
              onCall={onCall}
              onViewProfile={onViewProfile}
            />
          )}

          {/* Regular members */}
          {regularMembers.length > 0 && (
            <MemberSection
              title="Members"
              members={regularMembers}
              currentUserId={currentUserId}
              onMessage={onMessage}
              onCall={onCall}
              onViewProfile={onViewProfile}
            />
          )}

          {filteredMembers.length === 0 && (
            <div className="text-center py-8">
              <User className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No members found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

// Member section with title
function MemberSection({
  title,
  members,
  currentUserId,
  onMessage,
  onCall,
  onViewProfile,
}: {
  title: string;
  members: SpaceMember[];
  currentUserId?: string;
  onMessage?: (userId: string) => void;
  onCall?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {title} — {members.length}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {members.map((member, index) => (
          <MemberCard
            key={member.id}
            member={member}
            isCurrentUser={member.userId === currentUserId}
            onMessage={onMessage}
            onCall={onCall}
            onViewProfile={onViewProfile}
            delay={index * 0.02}
          />
        ))}
      </div>
    </div>
  );
}

// Individual member card
const MemberCard = memo(function MemberCard({
  member,
  isCurrentUser,
  onMessage,
  onCall,
  onViewProfile,
  delay = 0,
}: {
  member: SpaceMember;
  isCurrentUser?: boolean;
  onMessage?: (userId: string) => void;
  onCall?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
  delay?: number;
}) {
  const roleInfo = roleConfig[member.role];
  const RoleIcon = roleInfo.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Link
        to={`/profile/${member.username}`}
        className="group flex items-center gap-3 p-3 rounded-2xl hover:bg-muted/50 transition-all"
      >
        {/* Avatar with online indicator */}
        <div className="relative">
          <Avatar className="h-12 w-12 ring-2 ring-transparent group-hover:ring-primary/30 transition-all">
            {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
            <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30">
              {member.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          {/* Online indicator */}
          <div className={cn(
            "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background",
            member.isOnline ? "bg-green-500" : "bg-muted"
          )} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">
              {member.displayName || member.username}
              {isCurrentUser && (
                <span className="ml-1 text-xs text-muted-foreground">(you)</span>
              )}
            </p>
            {member.role !== 'member' && (
              <div className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium",
                roleInfo.bgColor,
                roleInfo.color
              )}>
                <RoleIcon className="h-3 w-3" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">@{member.username}</p>
        </div>

        {/* Quick actions */}
        {!isCurrentUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMessage?.(member.userId);
              }}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCall?.(member.userId);
              }}
            >
              <Phone className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Link>
    </motion.div>
  );
});
