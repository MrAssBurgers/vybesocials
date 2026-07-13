import { memo, useMemo, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { useQuickAddSuggestions } from '@/hooks/useQuickAddSuggestions';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useDismissedQuickAdd } from '@/hooks/useDismissedQuickAdd';

interface CompactProfileSuggestionsProps {
  excludeProfileId: string;
}

export const CompactProfileSuggestions = memo(function CompactProfileSuggestions({
  excludeProfileId,
}: CompactProfileSuggestionsProps) {
  const { suggestions } = useQuickAddSuggestions(12);
  const sendRequest = useSendFriendRequest();
  const { dismissUser } = useDismissedQuickAdd();
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () =>
      (suggestions || [])
        .filter((person) => person.id !== excludeProfileId && !removed.has(person.id))
        .slice(0, 6),
    [suggestions, excludeProfileId, removed],
  );

  if (!visible.length) return null;

  const handleAdd = (userId: string) => {
    setRemoved((prev) => new Set([...prev, userId]));
    sendRequest.mutate(userId, {
      onError: () => {
        toast.error("Couldn't send request");
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      },
    });
  };

  const handleDismiss = (userId: string) => {
    setRemoved((prev) => new Set([...prev, userId]));
    dismissUser(userId);
  };

  return (
    <section aria-labelledby="profile-suggestions-title" className="space-y-2">
      <h2
        id="profile-suggestions-title"
        className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        People you may know
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1" role="list">
        {visible.map((person) => (
          <div
            key={person.id}
            role="listitem"
            className="relative flex w-32 shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-border/30 bg-card/70 p-3 text-center"
          >
            <button
              type="button"
              onClick={() => handleDismiss(person.id)}
              className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground/70 transition-colors hover:bg-background/70 hover:text-foreground"
              aria-label={`Dismiss ${person.display_name || person.username}`}
            >
              <X className="h-3 w-3" />
            </button>

            <ProfileLink username={person.username} userId={person.id} className="mt-1">
              <Avatar
                className="h-12 w-12"
                data-profile-id={person.id}
                data-avatar-url={person.avatar_url || undefined}
              >
                <AvatarImage
                  src={person.avatar_url || undefined}
                  alt={`${person.display_name || person.username}'s avatar`}
                />
                <AvatarFallback>{person.username[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </ProfileLink>

            <span className="w-full min-w-0">
              <span className="block truncate text-xs font-semibold">
                {person.display_name || person.username}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {person.mutual_count > 0
                  ? `${person.mutual_count} mutual`
                  : person.subtitle || `@${person.username}`}
              </span>
            </span>

            <Button
              size="sm"
              className="h-7 w-full gap-1 rounded-full text-[11px] font-semibold"
              onClick={() => handleAdd(person.id)}
              aria-label={`Add ${person.display_name || person.username}`}
            >
              <UserPlus className="h-3 w-3" />
              Add
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
});
