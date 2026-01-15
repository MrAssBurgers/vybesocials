import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, MessageCircle } from 'lucide-react';
import { useMutualFriendsWithUser } from './MutualFriendsDisplay';
import { useCreateConversation } from '@/hooks/useMessages';
import { toast } from 'sonner';

interface MutualFriendsSheetProps {
  targetUserId: string;
  children: React.ReactNode;
}

export const MutualFriendsSheet = memo(function MutualFriendsSheet({
  targetUserId,
  children,
}: MutualFriendsSheetProps) {
  const navigate = useNavigate();
  const { data: mutualFriends, isLoading } = useMutualFriendsWithUser(targetUserId);
  const createConversation = useCreateConversation();

  const handleProfileClick = (username: string) => {
    navigate(`/u/${username}`);
  };

  const handleMessage = async (userId: string) => {
    try {
      const conversation = await createConversation.mutateAsync({ memberIds: [userId] });
      navigate(`/messages/${conversation.id}`);
    } catch (error) {
      toast.error('Failed to start conversation');
    }
  };

  const count = mutualFriends?.length || 0;

  return (
    <Sheet>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {count} Mutual Friend{count !== 1 ? 's' : ''}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100%-60px)]">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No mutual friends</h3>
              <p className="text-muted-foreground">You don't have any friends in common yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {mutualFriends?.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 transition-colors"
                >
                  <button
                    onClick={() => handleProfileClick(friend.username)}
                    className="flex-shrink-0"
                  >
                    <Avatar className="h-12 w-12 ring-2 ring-background">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20">
                        {friend.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>

                  <button
                    onClick={() => handleProfileClick(friend.username)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="font-semibold truncate">
                      {friend.display_name || friend.username}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      @{friend.username}
                    </p>
                  </button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMessage(friend.id)}
                    disabled={createConversation.isPending}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
});
