import { useState, memo, useMemo } from 'react';
import { Users, UserPlus, LogOut, Trash2, Crown, Shield, Search, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  useGroupMembers, 
  useRemoveGroupMember, 
  useAddGroupMember,
  useLeaveGroup,
  useUpdateGroupSettings,
  useMyGroupRole,
  GroupMember 
} from '@/hooks/useGroupChat';
import { useFriends } from '@/hooks/useFriends';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface GroupInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  groupName: string;
  groupAvatar?: string | null;
  creatorId?: string | null;
}

export const GroupInfoSheet = memo(function GroupInfoSheet({
  open,
  onOpenChange,
  conversationId,
  groupName,
  groupAvatar,
  creatorId,
}: GroupInfoSheetProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: members = [] } = useGroupMembers(conversationId);
  const { data: myRole } = useMyGroupRole(conversationId);
  const { data: friends = [] } = useFriends();
  
  const removeMember = useRemoveGroupMember();
  const addMember = useAddGroupMember();
  const leaveGroup = useLeaveGroup();
  const updateSettings = useUpdateGroupSettings();

  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(groupName);

  const isCreator = profile?.id === creatorId || myRole === 'owner';
  const memberIds = useMemo(() => new Set(members.map(m => m.user_id)), [members]);

  // Friends who are not already in the group
  // useFriends returns flat friend objects, not nested
  const availableFriends = useMemo(() => {
    if (!friends) return [];
    return friends.filter(f => f && !memberIds.has(f.id));
  }, [friends, memberIds]);

  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return availableFriends;
    const query = searchQuery.toLowerCase();
    return availableFriends.filter(f => 
      f?.username?.toLowerCase().includes(query) ||
      f?.display_name?.toLowerCase().includes(query)
    );
  }, [availableFriends, searchQuery]);

  const handleRemoveMember = async (userId: string) => {
    await removeMember.mutateAsync({ conversationId, userId });
  };

  const handleLeaveGroup = async () => {
    await leaveGroup.mutateAsync(conversationId);
    onOpenChange(false);
    navigate('/messages');
  };

  const handleAddSelectedMembers = async () => {
    for (const userId of selectedMembers) {
      await addMember.mutateAsync({ conversationId, userId });
    }
    setSelectedMembers([]);
    setShowAddMembers(false);
  };

  const toggleMemberSelection = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSaveName = async () => {
    if (newName.trim() && newName !== groupName) {
      await updateSettings.mutateAsync({ conversationId, name: newName.trim() });
    }
    setEditingName(false);
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-3 w-3 text-yellow-500" />;
      case 'admin': return <Shield className="h-3 w-3 text-blue-500" />;
      default: return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Group Info
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Group Avatar & Name */}
            <div className="flex flex-col items-center gap-3">
              <Avatar className="h-20 w-20 ring-2 ring-border">
                <AvatarImage src={groupAvatar || undefined} />
                <AvatarFallback className="text-2xl bg-primary/10">
                  {groupName?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              {editingName && isCreator ? (
                <div className="flex items-center gap-2 w-full max-w-xs">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="text-center"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" onClick={handleSaveName}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button 
                  onClick={() => isCreator && setEditingName(true)}
                  className={cn(
                    "text-lg font-semibold",
                    isCreator && "hover:text-primary cursor-pointer"
                  )}
                >
                  {groupName}
                </button>
              )}
              
              <p className="text-sm text-muted-foreground">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Add Members Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAddMembers(true)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Members
            </Button>

            {/* Members List */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Members</h3>
              <div className="space-y-1">
                {members.map((member) => (
                  <div 
                    key={member.id} 
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {(member.profile?.display_name || member.profile?.username)?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">
                            {member.profile?.display_name || member.profile?.username}
                          </span>
                          {getRoleIcon(member.role)}
                          {member.user_id === profile?.id && (
                            <span className="text-[10px] text-muted-foreground">(You)</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground capitalize">
                          {member.role}
                        </span>
                      </div>
                    </div>

                    {/* Remove button - only for creator, not for self or other owners */}
                    {isCreator && member.user_id !== profile?.id && member.role !== 'owner' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="z-[100]">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove member?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove {member.profile?.display_name || member.profile?.username} from the group?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleRemoveMember(member.user_id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Leave Group Button */}
            {!isCreator && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full text-destructive border-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Leave Group
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="z-[100]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave group?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You'll need to be added back to rejoin this group.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleLeaveGroup}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Leave
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </ScrollArea>

        {/* Add Members Overlay */}
        {showAddMembers && (
          <div className="absolute inset-0 bg-background z-10 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Add Members</h3>
              <Button variant="ghost" size="icon" onClick={() => {
                setShowAddMembers(false);
                setSelectedMembers([]);
                setSearchQuery('');
              }}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search friends..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <ScrollArea className="flex-1 px-4">
              {filteredFriends.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {searchQuery ? 'No friends found' : 'All friends are already in this group'}
                </p>
              ) : (
                <div className="space-y-1 pb-4">
                  {filteredFriends.map((friend) => {
                    if (!friend) return null;
                    const isSelected = selectedMembers.includes(friend.id);
                    return (
                      <button
                        key={friend.id}
                        onClick={() => toggleMemberSelection(friend.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                          isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                        )}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback>
                            {(friend.display_name || friend.username)?.[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 text-left font-medium">
                          {friend.display_name || friend.username}
                        </span>
                        <div className={cn(
                          "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {selectedMembers.length > 0 && (
              <div className="p-4 border-t">
                <Button 
                  className="w-full" 
                  onClick={handleAddSelectedMembers}
                  disabled={addMember.isPending}
                >
                  Add {selectedMembers.length} Member{selectedMembers.length !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
});
