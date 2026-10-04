import { useCommunityRequest } from '@/hooks/useCommunityRequest';
import { useCommunityMutation } from '@/hooks/useCommunityMutation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ChannelMessage } from '@/hooks/useServers';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function useCommunityMessageActions(message: ChannelMessage) {
  const communityRequest = useCommunityRequest();
  const client = useQueryClient();
  const [action, setAction] = useState<'editMessage' | 'deleteMessage' | null>(null);
  const [draft, setDraft] = useState('');
  const mutation = useCommunityMutation({
    mutationFn: () => communityRequest('community-manage', { action, messageId: message.id, channelId: message.channel_id, ...(action === 'editMessage' ? { content: draft } : {}) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['channel-messages', message.channel_id] });
      setAction(null);
    },
    onError: (error: Error) => toast.error(error.message || 'Message could not be updated'),
  });
  return {
    edit: () => { setDraft(message.content || ''); setAction('editMessage'); },
    remove: () => setAction('deleteMessage'),
    dialog: <Dialog open={action !== null} onOpenChange={open => { if (!open && !mutation.isPending) setAction(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{action === 'editMessage' ? 'Edit message' : 'Remove message?'}</DialogTitle>
          <DialogDescription>{action === 'editMessage' ? 'Your updated message will be marked as edited.' : 'This removes the message from this channel for everyone.'}</DialogDescription>
        </DialogHeader>
        {action === 'editMessage' && <Textarea aria-label="Message text" value={draft} maxLength={8000} onChange={event => setDraft(event.target.value)} />}
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action === 'deleteMessage' ? 'destructive' : 'default'} disabled={mutation.isPending || (action === 'editMessage' && !draft.trim())} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : action === 'editMessage' ? 'Save changes' : 'Remove message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  };
}
