import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Contact, Search as SearchIcon, Sparkles, UserCheck, Users, X } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { FriendButton } from '@/components/friends/FriendButton';
import { FriendRequestsList } from '@/components/friends/FriendRequestsList';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { useAuth } from '@/lib/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchPeople } from '@/hooks/useSearchPeople';
import { useQuickAddSuggestions } from '@/hooks/useQuickAddSuggestions';
import { DiscoveryReadStatus } from '@/components/friends/DiscoveryReadStatus';
import { useRecentlyAcceptedFriends } from '@/hooks/useFriends';
import { useDismissedQuickAdd } from '@/hooks/useDismissedQuickAdd';
import { haptics } from '@/lib/haptics';

type AddFriendsTab = 'add' | 'requests';

export default function AddFriendsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: AddFriendsTab = searchParams.get('tab') === 'requests' ? 'requests' : 'add';
  const [tab, setTab] = useState<AddFriendsTab>(initialTab);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: people, isPending: loadingPeople } = useSearchPeople(debouncedQuery);
  const hasQuery = debouncedQuery.length >= 2;

  const handleTabChange = (value: string) => {
    haptics.tap();
    const next = value === 'requests' ? 'requests' : 'add';
    setTab(next);
    setSearchParams(next === 'requests' ? { tab: 'requests' } : {}, { replace: true });
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 pt-[max(1rem,var(--sat,0px))] pb-24">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0" onClick={() => navigate('/messages')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Friends</h1>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="w-full grid grid-cols-2 mb-5 bg-card/75 border-white/10 backdrop-blur-md">
            <TabsTrigger value="add" className="gap-1.5">
              <Users className="h-4 w-4" />
              Add Friends
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5">
              <UserCheck className="h-4 w-4" />
              Requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="space-y-5">
            <div className="relative rounded-2xl">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder="Search by name or @username"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-11 pr-10 h-12 rounded-2xl bg-card/85 backdrop-blur-md border-white/10 text-base"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {hasQuery ? (
              <SearchResults people={people} isLoading={loadingPeople} currentProfileId={profile?.id} />
            ) : (
              <QuickAddSection currentProfileId={profile?.id} />
            )}
          </TabsContent>

          <TabsContent value="requests" className="space-y-6">
            <FriendRequestsList />
            <AcceptedRecentlySection />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function PersonRow({
  id,
  username,
  displayName,
  avatarUrl,
  subtitle,
}: {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-card/80 backdrop-blur-md border border-white/10 hover:bg-card/90 transition-colors">
      <ProfileLink userId={id} username={username} className="shrink-0">
        <Avatar className="h-12 w-12 ring-1 ring-border/30">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {(displayName || username)?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </ProfileLink>
      <ProfileLink userId={id} username={username} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-foreground truncate">{displayName || username}</p>
        <p className="text-xs text-foreground/65 truncate">{subtitle || `@${username}`}</p>
      </ProfileLink>
      <FriendButton userId={id} size="sm" showText={false} />
    </div>
  );
}

function SearchResults({
  people,
  isLoading,
  currentProfileId,
}: {
  people?: { id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string | null }[];
  isLoading: boolean;
  currentProfileId?: string;
}) {
  const filtered = useMemo(
    () => (people || []).filter((p) => p.id !== currentProfileId),
    [people, currentProfileId],
  );

  if (isLoading && filtered.length === 0) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5">
            <Skeleton className="h-12 w-12 rounded-full shrink-0" animate={false} />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" animate={false} />
              <Skeleton className="h-3 w-1/3" animate={false} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No one matched your search</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((person) => (
        <PersonRow
          key={person.id}
          id={person.id}
          username={person.username}
          displayName={person.display_name}
          avatarUrl={person.avatar_url}
          subtitle={person.bio || undefined}
        />
      ))}
    </div>
  );
}

function QuickAddSection({ currentProfileId }: { currentProfileId?: string }) {
  const { suggestions, isLoading, error, ageReviewRequired, retry } = useQuickAddSuggestions(20);
  const { dismissUser } = useDismissedQuickAdd();
  const filtered = suggestions.filter((s) => s.id !== currentProfileId);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => haptics.tap()}
        className="relative w-full rounded-xl h-12 flex items-center justify-center gap-2 bg-card/80 backdrop-blur-md border border-primary/40 text-primary font-medium overflow-hidden group hover:bg-card/90 hover:border-primary/55 transition-colors"
      >
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        <Contact className="h-4 w-4 relative z-10" />
        <span className="relative z-10">Find friends from contacts</span>
      </button>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Suggested for you</h2>
        </div>

        {error || ageReviewRequired ? <DiscoveryReadStatus error={error} ageReviewRequired={ageReviewRequired} retry={retry} /> : isLoading && filtered.length === 0 ? (
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" animate={false} />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" animate={false} />
                  <Skeleton className="h-3 w-1/3" animate={false} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No suggestions right now — check back later.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((person) => (
              <div key={person.id} className="group relative">
                <PersonRow
                  id={person.id}
                  username={person.username}
                  displayName={person.display_name}
                  avatarUrl={person.avatar_url}
                  subtitle={person.subtitle}
                />
                <button
                  type="button"
                  onClick={() => dismissUser(person.id)}
                  className="absolute right-1 top-1 h-5 w-5 rounded-full bg-background/80 text-foreground/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                  aria-label="Not interested"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AcceptedRecentlySection() {
  const { data: recentlyAccepted, isLoading } = useRecentlyAcceptedFriends(15);

  if (!isLoading && (!recentlyAccepted || recentlyAccepted.length === 0)) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <UserCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Accepted recently</h2>
      </div>
      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5">
              <Skeleton className="h-12 w-12 rounded-full shrink-0" animate={false} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" animate={false} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {(recentlyAccepted || []).map((friend) => (
            <div key={friend.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-card/80 backdrop-blur-md border border-white/10 hover:bg-card/90 transition-colors">
              <ProfileLink userId={friend.id} username={friend.username} className="shrink-0">
                <Avatar className="h-12 w-12 ring-1 ring-border/30">
                  <AvatarImage src={friend.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {(friend.display_name || friend.username)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </ProfileLink>
              <ProfileLink userId={friend.id} username={friend.username} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground truncate">{friend.display_name || friend.username}</p>
                <p className="text-xs text-foreground/65 truncate">@{friend.username}</p>
              </ProfileLink>
              <span className="text-xs text-primary font-medium flex items-center gap-1 shrink-0">
                <UserCheck className="h-3.5 w-3.5" />
                Friends
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
