import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Edit3, Pin, Crown, UserMinus, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface GroupChatSettingsProps {
  conversationId: string;
  conversation: any;
  members: any[];
  onClose: () => void;
}

export function GroupChatSettings({ conversationId, conversation, members, onClose }: GroupChatSettingsProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [groupName, setGroupName] = useState(conversation?.name || '');
  const isCreator = conversation?.created_by === profile?.id;

  const saveGroupName = useCallback(async () => {
    if (!groupName.trim()) return;
    const { error } = await supabase
      .from('conversations')
      .update({ name: groupName.trim() })
      .eq('id', conversationId);
    if (error) {
      toast.error('Failed to update name');
    } else {
      triggerHaptic('medium');
      toast.success('Group name updated');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setEditing(false);
    }
  }, [groupName, conversationId, queryClient]);

  const removeMember = useCallback(async (userId: string) => {
    if (!isCreator) return;
    const { error } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    if (error) {
      toast.error('Failed to remove member');
    } else {
      triggerHaptic('medium');
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  }, [isCreator, conversationId, queryClient]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Group Name */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Group Name</p>
        {editing ? (
          <div className="flex gap-2">
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={50}
              className="flex-1 h-9 text-sm"
              autoFocus
            />
            <Button size="sm" onClick={saveGroupName} className="h-9 w-9 p-0">
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-9 w-9 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => { if (isCreator) setEditing(true); }}
            className={cn(
              "flex items-center gap-2 w-full p-2.5 rounded-xl bg-muted/30 text-sm",
              isCreator && "hover:bg-muted/50 cursor-pointer"
            )}
          >
            <span className="flex-1 text-left text-foreground font-medium truncate">
              {conversation?.name || 'Unnamed Group'}
            </span>
            {isCreator && <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        )}
      </div>

      {/* Members */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Members · {members.length}
        </p>
        <div className="space-y-1">
          {members.map((member) => {
            const isSelf = member.user_id === profile?.id;
            const isMemberCreator = member.user_id === conversation?.created_by;
            return (
              <div
                key={member.user_id}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={member.avatar_url || ''} />
                  <AvatarFallback className="text-xs bg-primary/20 text-primary">
                    {(member.display_name || member.username || '?')[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {member.display_name || member.username}
                    {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                  </p>
                </div>
                {isMemberCreator && (
                  <Crown className="h-4 w-4 text-amber-500 flex-shrink-0" />
                )}
                {isCreator && !isSelf && !isMemberCreator && (
                  <button
                    onClick={() => removeMember(member.user_id)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
