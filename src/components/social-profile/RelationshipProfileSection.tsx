import { useState } from 'react';
import { Flame, Heart, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useRelationshipState } from '@/hooks/useRelationshipState';
import { isRelationshipEmojiUiEnabled } from '@/lib/relationshipFeatureFlags';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import {
  pickPrimaryInboxEmoji,
  RELATIONSHIP_STATE_LABELS,
  resolveStreakDisplay,
} from '@/lib/relationship/relationshipEmojiMap';
import { useRelationshipEmojiPreferences } from '@/hooks/useRelationshipEmojiPreferences';
import type { PrimaryRelationshipState } from '@/lib/relationship/relationshipTypes';

interface RelationshipProfileSectionProps {
  friendId: string;
  friendName: string;
}

export function RelationshipProfileSection({
  friendId,
  friendName,
}: RelationshipProfileSectionProps) {
  const profileId = useAuthProfileId();
  const enabled = isRelationshipEmojiUiEnabled(profileId);
  const { data: state, isLoading } = useRelationshipState(friendId, enabled);
  const { data: emojiPrefs } = useRelationshipEmojiPreferences(enabled ? profileId : null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!enabled) return null;
  if (isLoading) {
    return <Skeleton className="h-28 w-full rounded-2xl" />;
  }
  if (!state?.primary_relationship_state && !state?.streak_count) return null;

  const emoji = pickPrimaryInboxEmoji({
    primaryState: state.primary_relationship_state,
    birthdayState: state.birthday_state,
    streakState: state.streak_state,
    favoriteState: state.favorite_state,
    prefs: emojiPrefs,
  });
  const streak = resolveStreakDisplay(
    state.streak_count || 0,
    state.streak_state ?? null,
    emojiPrefs,
  );
  const title =
    state.relationship_title ||
    (state.primary_relationship_state
      ? RELATIONSHIP_STATE_LABELS[state.primary_relationship_state as PrimaryRelationshipState]
      : 'Friend');

  return (
    <>
      <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Relationship
            </p>
            <p className="mt-1 text-lg font-semibold">
              {emoji ? `${emoji} ` : ''}
              {title}
            </p>
            {state.best_friend_rank != null && (
              <p className="text-sm text-muted-foreground">
                Best Friends #{state.best_friend_rank} · private to you
              </p>
            )}
            {streak ? (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <Flame className="h-3.5 w-3.5" />
                {streak}
              </p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSheetOpen(true)}>
            Details
          </Button>
        </div>
      </section>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{friendName}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4 text-sm">
            <p>
              <span className="text-2xl" aria-hidden>
                {emoji || '💬'}
              </span>{' '}
              {title}
            </p>
            {state.best_friend_rank != null && (
              <p className="text-muted-foreground">
                Ranked #{state.best_friend_rank} in your Best Friends. Only you see this rank.
              </p>
            )}
            {streak && (
              <p className="flex items-center gap-2">
                <Flame className="h-4 w-4" />
                Snap streak: {streak}
              </p>
            )}
            {state.favorite_state && (
              <p className="flex items-center gap-2">
                <Pin className="h-4 w-4" />
                {state.favorite_state === 'mutual_pinned' ? 'Mutually pinned' : 'Pinned favorite'}
              </p>
            )}
            {state.birthday_state === 'today' && (
              <p className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Birthday today
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
