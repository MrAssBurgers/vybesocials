import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import type { MessageRequest } from '@/hooks/useMessageRequests';
import { useQuickAddSuggestions } from '@/hooks/useQuickAddSuggestions';
import { DiscoveryReadStatus } from '@/components/friends/DiscoveryReadStatus';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { DMRequestRow } from '@/features/dms/DMRequestRow';
import { INBOX_CATEGORY_EMPTY } from './inboxCategoryModel';

interface NewConnectionsSectionProps {
  pendingRequests: MessageRequest[];
  profileId?: string;
  onOpenConversation: (conversationId: string) => void;
}

export function NewConnectionsSection({
  pendingRequests,
  profileId,
  onOpenConversation,
}: NewConnectionsSectionProps) {
  const navigate = useNavigate();
  const { suggestions, error, ageReviewRequired, isLoading, retry } = useQuickAddSuggestions(8);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const empty = INBOX_CATEGORY_EMPTY.new;

  const visibleSuggestions = useMemo(
    () =>
      (suggestions || []).filter(
        (s) => s?.id && s.id !== profileId && !dismissed.has(s.id),
      ),
    [suggestions, profileId, dismissed],
  );

  if (!pendingRequests.length && !visibleSuggestions.length) {
    if (error || ageReviewRequired || isLoading) return <DiscoveryReadStatus error={error} ageReviewRequired={ageReviewRequired} isLoading={isLoading} retry={retry} />;
    return (
      <div className="dm-inbox-new-section dm-inbox-empty dm-inbox-empty--inline">
        <h2>{empty.title}</h2>
        <p>{empty.body}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/add-friends')}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Find friends
        </Button>
      </div>
    );
  }

  return (
    <section className="dm-inbox-new-section" aria-label="New connections">
      <DiscoveryReadStatus error={error} ageReviewRequired={ageReviewRequired} isLoading={isLoading} retry={retry} />
      {pendingRequests.map((request) => (
        <DMRequestRow key={`new-request-${request.id}`} request={request} />
      ))}
      {visibleSuggestions.map((user) => (
        <div key={`suggest-${user.id}`} className="dm-inbox-suggestion-row">
          <Avatar className="h-11 w-11 shrink-0">
            <ProfileAvatarImage
              profileId={user.id}
              src={resolveProfileAvatarUrl(user.id, user.avatar_url)}
              transformSize={88}
            />
            <AvatarFallback>{user.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {user.display_name || user.username || 'Vyber'}
            </p>
            <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/u/${encodeURIComponent(user.username || user.id)}`)}
          >
            Add
          </Button>
          <button
            type="button"
            className="dm-inbox-suggestion-dismiss"
            aria-label="Dismiss suggestion"
            onClick={() => setDismissed((prev) => new Set(prev).add(user.id))}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </section>
  );
}
