import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  useRespondToMessageRequest,
  type MessageRequest,
} from '@/hooks/useMessageRequests';
import { db } from '@/lib/firebase';
import { triggerHaptic } from '@/lib/haptics';
import { compactTime } from '@/lib/compactTime';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';

export function DMRequestRow({ request }: { request: MessageRequest }) {
  const navigate = useNavigate();
  const respond = useRespondToMessageRequest();
  const [busy, setBusy] = useState(false);
      const name =
        request.sender?.username ||
        `User ${String(request.sender_id || '?').slice(0, 6)}`;
  const avatarUrl = resolveProfileAvatarUrl(
    request.sender?.id || request.sender_id,
    request.sender?.avatar_url,
  );
  const preview = request.message_preview?.trim() || 'Wants to message you';
  const age = compactTime(request.created_at);

  const accept = async () => {
    setBusy(true);
    triggerHaptic('medium');
    try {
      const { data: convId, error } = await db.rpc('create_dm_conversation', {
        other_profile_id: request.sender_id,
      });
      if (error) throw error;
      await respond.mutateAsync({ requestId: request.id, action: 'accepted' });
      if (convId) navigate(`/messages/${String(convId)}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to accept request');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    triggerHaptic('light');
    try {
      await respond.mutateAsync({ requestId: request.id, action: 'declined' });
    } catch (error) {
      console.error(error);
      toast.error('Failed to decline request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dm-inbox-card dm-inbox-card--request">
      <div className="dm-inbox-avatar-button" aria-hidden>
        <span className="dm-inbox-avatar-ring" />
        <Avatar className="dm-inbox-avatar">
          <ProfileAvatarImage
            profileId={request.sender?.id || request.sender_id}
            src={avatarUrl || undefined}
            transformSize={160}
          />
          <AvatarFallback className="bg-muted text-sm font-semibold">
            {name[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="dm-inbox-row-copy">
        <p className="dm-inbox-name">{name}</p>
        <p className="dm-inbox-status dm-inbox-status-tone--received">
          <span>Request{age ? ` • ${age}` : ''}</span>
        </p>
        <p className="dm-inbox-message-preview">{preview}</p>
      </div>
      <div className="dm-inbox-row-trail">
        <div className="dm-inbox-row-trail-actions">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-full"
            disabled={busy}
            onClick={() => void decline()}
            aria-label="Decline request"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 rounded-full"
            disabled={busy}
            onClick={() => void accept()}
            aria-label="Accept request"
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
