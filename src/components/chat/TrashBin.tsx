import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  useTrashedConversations, 
  useRestoreConversation, 
  usePermanentlyDeleteConversation 
} from '@/hooks/useTrashedConversations';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { ensureArray, safeDmMembers } from '@/lib/persistedCollections';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetTrigger 
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
} from '@/components/ui/alert-dialog';
import { Trash2, RotateCcw, Users, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface TrashBinProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function TrashBin({ open, onOpenChange, trigger }: TrashBinProps) {
  const profileId = useAuthProfileId();
  const { data: trashedConversationsRaw, isLoading, refetch } = useTrashedConversations();
  const trashedConversations = ensureArray(trashedConversationsRaw);
  const restoreConversation = useRestoreConversation();
  const permanentlyDelete = usePermanentlyDeleteConversation();
  
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);

  const handleRestore = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await restoreConversation.mutateAsync(conversationId);
  };

  const handlePermanentDelete = async () => {
    if (deleteConfirmId) {
      await permanentlyDelete.mutateAsync(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const getDisplayInfo = (trashed: any) => {
    const conversation = trashed.conversation;
    if (!conversation) return { name: 'Unknown', avatar: null };

    if (conversation.is_group) {
      return {
        name: conversation.name || 'Group Chat',
        avatar: conversation.avatar_url,
        isGroup: true,
      };
    }

    const otherMember = safeDmMembers(conversation.members).find(
      (m: any) => m.user_id !== profileId
    );
    
    return {
      name: otherMember?.profile?.display_name || otherMember?.profile?.username || 'Unknown',
      avatar: otherMember?.profile?.avatar_url,
      isGroup: false,
    };
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          <SheetHeader className="p-4 pb-2 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <SheetTitle>Trash</SheetTitle>
                <SheetDescription className="text-xs">
                  Chats are auto-deleted after 30 days
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-120px)]">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : trashedConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                  <Trash2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">Trash is empty</h3>
                <p className="text-sm text-muted-foreground">
                  Deleted chats will appear here
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                <AnimatePresence mode="popLayout">
                  {trashedConversations.map((trashed) => {
                    const info = getDisplayInfo(trashed);
                    const daysRemaining = trashed.auto_delete_at
                      ? Math.ceil(
                          (new Date(trashed.auto_delete_at).getTime() - Date.now()) / 
                          (1000 * 60 * 60 * 24)
                        )
                      : null;

                    return (
                      <motion.div
                        key={trashed.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-card border hover:bg-accent/50 transition-colors"
                      >
                        <div className="relative">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={info.avatar || undefined} />
                            <AvatarFallback>
                              {info.isGroup ? (
                                <Users className="h-5 w-5" />
                              ) : (
                                info.name?.charAt(0).toUpperCase()
                              )}
                            </AvatarFallback>
                          </Avatar>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{info.name}</p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>
                              Deleted {formatDistanceToNow(new Date(trashed.trashed_at), { addSuffix: true })}
                            </span>
                          </div>
                          {daysRemaining !== null && daysRemaining <= 7 && (
                            <p className={cn(
                              "text-xs mt-0.5 flex items-center gap-1",
                              daysRemaining <= 3 ? "text-destructive" : "text-amber-500"
                            )}>
                              <AlertTriangle className="h-3 w-3" />
                              {daysRemaining} days until permanent deletion
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-primary hover:text-primary"
                            onClick={(e) => handleRestore(trashed.conversation_id, e)}
                            disabled={restoreConversation.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(trashed.conversation_id);
                            }}
                            disabled={permanentlyDelete.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The chat will be removed forever.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
