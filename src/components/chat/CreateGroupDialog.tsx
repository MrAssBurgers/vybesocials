import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Search, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCreateGroup } from '@/hooks/useGroupChat';
import { useFriends } from '@/hooks/useFriends';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (conversationId: string) => void;
}

export function CreateGroupDialog({ open, onOpenChange, onSuccess }: CreateGroupDialogProps) {
  const [step, setStep] = useState<'name' | 'members'>('name');
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  const { profile } = useAuth();
  const { data: friends = [] } = useFriends();
  const createGroup = useCreateGroup();

  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const query = searchQuery.toLowerCase();
    return friends.filter((friend: any) => 
      friend.friend?.username?.toLowerCase().includes(query) ||
      friend.friend?.display_name?.toLowerCase().includes(query)
    );
  }, [friends, searchQuery]);

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;

    try {
      const result = await createGroup.mutateAsync({
        name: groupName.trim(),
        member_ids: selectedMembers,
      });
      
      onOpenChange(false);
      onSuccess?.(result.id);
      
      // Reset state
      setStep('name');
      setGroupName('');
      setSearchQuery('');
      setSelectedMembers([]);
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after animation
    setTimeout(() => {
      setStep('name');
      setGroupName('');
      setSearchQuery('');
      setSelectedMembers([]);
    }, 300);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">
              {step === 'name' ? 'New Group' : 'Add Members'}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={handleClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4">
            {step === 'name' ? (
              <div className="space-y-6">
                {/* Group avatar placeholder */}
                <div className="flex justify-center">
                  <button className="relative group">
                    <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                      <Users className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="h-6 w-6 text-white" />
                    </div>
                  </button>
                </div>

                {/* Group name input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Group Name
                  </label>
                  <Input
                    placeholder="Enter group name..."
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="h-12"
                    autoFocus
                  />
                </div>

                <Button
                  className="w-full h-12"
                  disabled={!groupName.trim()}
                  onClick={() => setStep('members')}
                >
                  Next
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search friends..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11"
                    autoFocus
                  />
                </div>

                {/* Selected count */}
                <p className="text-sm text-muted-foreground">
                  {selectedMembers.length} selected
                </p>

                {/* Friends list */}
                <ScrollArea className="h-[300px] -mx-4 px-4">
                  <div className="space-y-1">
                    {filteredFriends.map((friendship: any) => {
                      const friend = friendship.friend;
                      if (!friend) return null;
                      
                      const isSelected = selectedMembers.includes(friend.id);
                      
                      return (
                        <button
                          key={friend.id}
                          onClick={() => toggleMember(friend.id)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                            isSelected 
                              ? "bg-primary/10" 
                              : "hover:bg-muted/50"
                          )}
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback>
                              {(friend.display_name || friend.username)?.[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 text-left">
                            <p className="font-medium">
                              {friend.display_name || friend.username}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              @{friend.username}
                            </p>
                          </div>

                          <div className={cn(
                            "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors",
                            isSelected 
                              ? "bg-primary border-primary" 
                              : "border-muted-foreground/30"
                          )}>
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary-foreground" />
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {filteredFriends.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        No friends found
                      </p>
                    )}
                  </div>
                </ScrollArea>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => setStep('name')}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 h-12"
                    disabled={selectedMembers.length === 0 || createGroup.isPending}
                    onClick={handleCreate}
                  >
                    {createGroup.isPending ? 'Creating...' : 'Create Group'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
