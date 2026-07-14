import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowLeft, Users, Check, Clock, UserPlus, X, Loader2, Share2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { db } from "@/lib/firebase";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuthProfileId } from "@/hooks/useAuthProfileId";
import { RecentMessageUser } from "@/lib/recentMessageUsers";
import { useFriendshipStatus, useSendFriendRequest, useFriends, useRespondToFriendRequest, useFriendRequests } from "@/hooks/useFriends";
import { useSuggestedFriends } from "@/hooks/useFriendsOfFriends";
import { useQuickAddSuggestions, type QuickAddUser } from "@/hooks/useQuickAddSuggestions";
import { useDismissedQuickAdd } from "@/hooks/useDismissedQuickAdd";
import { useSimilarDNAUsers } from "@/hooks/useSimilarDNAUsers";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NFCFriendShare } from "@/components/friends/NFCFriendShare";

/* ── Added Me Section ─────────────────────────────── */

function AddedMeSection() {
  const { data, isLoading } = useFriendRequests();
  const respondToRequest = useRespondToFriendRequest();
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();

  const incoming = data?.incoming || [];
  if (isLoading && incoming.length === 0) return null;
  if (incoming.length === 0) return null;

  const displayed = showAll ? incoming : incoming.slice(0, 3);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">Added Me</h2>
        {incoming.length > 3 && (
          <button onClick={() => setShowAll(!showAll)} className="text-xs text-primary font-medium flex items-center gap-0.5">
            {showAll ? 'Show Less' : `View ${incoming.length - 3} More`}
            <ChevronDown className={cn("h-3 w-3 transition-transform", showAll && "rotate-180")} />
          </button>
        )}
      </div>
      <div className="friends-shell-card rounded-2xl overflow-hidden">
        <AnimatePresence initial={false}>
          {displayed.map((req) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 p-3 border-b border-border last:border-0"
            >
              <button onClick={() => navigate(`/u/${req.sender?.username}`)} className="flex-shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={req.sender?.avatar_url || undefined} />
                  <AvatarFallback>{req.sender?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{req.sender?.display_name || req.sender?.username}</p>
                <p className="text-xs text-muted-foreground">@{req.sender?.username}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  onClick={() => respondToRequest.mutate({ requestId: req.id, action: 'accept' })}
                  disabled={respondToRequest.isPending}
                  className="h-8 rounded-full px-3 text-xs gap-1"
                >
                  <Check className="h-3.5 w-3.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => respondToRequest.mutate({ requestId: req.id, action: 'decline' })}
                  disabled={respondToRequest.isPending}
                  className="h-8 w-8 rounded-full p-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ── Invite Banner ────────────────────────────────── */

function InviteBanner() {
  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join me on Vybe!',
          text: 'Add me on Vybe and let\'s connect!',
          url: 'https://vybeapp.lovable.app',
        });
      } else {
        await navigator.clipboard.writeText('https://vybeapp.lovable.app');
        toast.success('Link copied!');
      }
    } catch {}
  };

  return (
    <button
      onClick={handleShare}
      className="w-full friends-shell-card rounded-2xl p-3 flex items-center gap-3 hover:border-primary/25 transition-all"
    >
      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
        <Share2 className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-semibold">Invite your friends!</p>
        <p className="text-xs text-muted-foreground">Share a link to add friends on Vybe</p>
      </div>
    </button>
  );
}

/* ── Find Friends / Suggested ─────────────────────── */

function FindFriendsSection() {
  const { suggestions, isLoading } = useQuickAddSuggestions(40);
  const { data: similarDNA } = useSimilarDNAUsers(30);
  const { data: friends = [] } = useFriends();
  const { dismissUser } = useDismissedQuickAdd();
  const sendRequest = useSendFriendRequest();
  const navigate = useNavigate();

  const VISIBLE_COUNT = 6;
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [slots, setSlots] = useState<QuickAddUser[]>([]);
  const friendIds = useMemo(
    () => new Set(friends.map((f: { id?: string }) => f?.id).filter(Boolean) as string[]),
    [friends],
  );

  // Build the master pool: mutual / interest matches first, then DNA-similar users as backfill
  const pool = useMemo<QuickAddUser[]>(() => {
    const seen = new Set<string>();
    const out: QuickAddUser[] = [];
    for (const s of suggestions) {
      if (friendIds.has(s.id) || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    for (const s of similarDNA || []) {
      if (friendIds.has(s.id) || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({
        id: s.id,
        username: s.username,
        display_name: s.display_name,
        avatar_url: s.avatar_url,
        mutual_count: 0,
        subtitle: `${s.similarity}% DNA match · ${s.dominant_trait}`,
      });
    }
    return out;
  }, [suggestions, similarDNA, friendIds]);

  // Initialize / refill visible slots from the pool whenever the pool grows or someone is removed
  useEffect(() => {
    setSlots((prev) => {
      const keep = prev.filter((p) => !removed.has(p.id));
      if (keep.length >= VISIBLE_COUNT) return keep;
      const taken = new Set([...keep.map((p) => p.id), ...removed]);
      const next = [...keep];
      for (const candidate of pool) {
        if (next.length >= VISIBLE_COUNT) break;
        if (taken.has(candidate.id)) continue;
        next.push(candidate);
        taken.add(candidate.id);
      }
      return next;
    });
  }, [pool, removed]);

  const handleAdd = (userId: string) => {
    // Instantly remove and refill — fire-and-forget the request
    setRemoved((prev) => new Set([...prev, userId]));
    sendRequest.mutate(userId, {
      onSuccess: (result) => {
        if (result?.alreadyExists && result.state === 'accepted') {
          // Already friends — keep them removed from suggestions silently.
          return;
        }
      },
      onError: () => {
        toast.error("Couldn't send request");
        setRemoved((prev) => { const n = new Set(prev); n.delete(userId); return n; });
      },
    });
  };

  const handleDismiss = (userId: string) => {
    setRemoved((prev) => new Set([...prev, userId]));
    dismissUser(userId);
  };

  if (isLoading && slots.length === 0) {
    return (
      <section className="space-y-2">
        <div className="px-1 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-semibold">People with your Vybe</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  if (slots.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="px-1 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-sm font-semibold">People with your Vybe</h2>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {slots.map((person) => (
            <motion.div
              key={person.id}
              layout
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -10 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="relative rounded-2xl bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-border/60 p-3 flex flex-col items-center text-center overflow-hidden group"
            >
              <button
                onClick={() => handleDismiss(person.id)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-background/70 transition-colors z-10"
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>

              <button
                onClick={() => navigate(`/u/${person.username}`)}
                className="mb-2"
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent blur-md opacity-50 group-hover:opacity-70 transition-opacity" />
                  <Avatar className="h-14 w-14 ring-2 ring-background relative">
                    <AvatarImage src={person.avatar_url || undefined} />
                    <AvatarFallback className="text-base font-bold bg-primary/15 text-primary">
                      {(person.display_name || person.username)?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </button>

              <p className="text-xs font-semibold truncate w-full px-1">
                {person.display_name || person.username}
              </p>
              <p className="text-[10px] text-muted-foreground truncate w-full px-1 mb-2">
                {person.subtitle || `@${person.username}`}
              </p>

              <Button
                size="sm"
                onClick={() => handleAdd(person.id)}
                className="w-full h-7 rounded-full text-[11px] font-semibold gap-1 mt-auto"
              >
                <UserPlus className="h-3 w-3" />
                Add
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ── Search Result Row ────────────────────────────── */

function ResultRow({
  user,
  active,
  id,
}: {
  user: RecentMessageUser;
  active: boolean;
  id: string;
}) {
  const { data: friendship } = useFriendshipStatus(user.id);
  const sendRequest = useSendFriendRequest();
  const respondToRequest = useRespondToFriendRequest();
  
  const handleAddFriend = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendRequest.mutate(user.id);
  };

  const handleAcceptRequest = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (friendship?.requestId) {
      respondToRequest.mutate({ requestId: friendship.requestId, action: 'accept' });
    }
  };

  return (
    <div
      id={id}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={user.avatar_url || undefined} alt={user.username} />
        <AvatarFallback>{(user.display_name || user.username).charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{user.display_name || user.username}</p>
        <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
      </div>
      
      {friendship?.status === 'none' && (
        <Button size="sm" onClick={handleAddFriend} disabled={sendRequest.isPending} className="shrink-0 gap-1 h-7 rounded-full text-xs px-3">
          <UserPlus className="h-3.5 w-3.5" />
          Add
        </Button>
      )}
      {friendship?.status === 'pending_received' && (
        <Button size="sm" onClick={handleAcceptRequest} disabled={respondToRequest.isPending} className="shrink-0 gap-1 h-7 rounded-full text-xs px-3">
          <Check className="h-3.5 w-3.5" />
          Accept
        </Button>
      )}
      {friendship?.status === 'friends' && (
        <span className="text-[10px] text-muted-foreground px-2 py-1 rounded-full bg-muted">Friends</span>
      )}
      {friendship?.status === 'pending_sent' && (
        <span className="text-[10px] text-muted-foreground px-2 py-1 rounded-full bg-muted">Pending</span>
      )}
      {!friendship?.status && (
        <Button size="sm" disabled className="shrink-0 gap-1 h-7 rounded-full text-xs px-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </Button>
      )}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────── */

export default function NewMessage() {
  const navigate = useNavigate();
  const profileId = useAuthProfileId();

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setActiveIndex(0); }, [debounced]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const { data: results, isLoading, isFetching } = useQuery({
    queryKey: ["add-friend-user-search", debounced, profileId],
    queryFn: async () => {
      if (!debounced || !profileId) return [] as RecentMessageUser[];
      const { data, error } = await db
        .from("profiles")
        .select("id, username, avatar_url, display_name")
        .neq("id", profileId)
        .or(`username.ilike.%${debounced}%,display_name.ilike.%${debounced}%`)
        .order("username", { ascending: true })
        .limit(25);
      if (error) throw error;
      const sortedData = (data || []).sort((a, b) => {
        const aExact = a.username.toLowerCase() === debounced.toLowerCase();
        const bExact = b.username.toLowerCase() === debounced.toLowerCase();
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });
      return sortedData as RecentMessageUser[];
    },
    enabled: debounced.length > 0 && !!profileId,
    staleTime: 30000,
    networkMode: 'always',
  });

  const safeResults = results || [];
  const showLoading = isLoading && safeResults.length === 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!safeResults.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, safeResults.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
  };

  useEffect(() => {
    const el = document.getElementById(`add-friend-row-${activeIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <AppLayout>
      <div className="h-[calc(100vh-5rem)] md:h-screen flex flex-col max-w-2xl mx-auto">
        <header className="p-4 border-b border-border flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/messages")} aria-label="Back to messages">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Add Friends</h1>
          </div>
          <NFCFriendShare variant="icon" />
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* NFC Friend Share */}

            {/* Added Me Section */}
            <AddedMeSection />

            {/* Invite Banner */}
            <InviteBanner />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by username"
                className="pl-10"
                aria-label="Search users"
              />
            </div>

            {/* Search Results */}
            {debounced && (
              <section className="rounded-xl border border-border overflow-hidden">
                {showLoading ? (
                  <div className="p-2 space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 p-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : safeResults.length > 0 ? (
                  <div className="max-h-[40vh] overflow-y-auto">
                    {safeResults.map((u, idx) => (
                      <ResultRow key={u.id} id={`add-friend-row-${idx}`} user={u} active={idx === activeIndex} />
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">No users found.</div>
                )}
              </section>
            )}

            {/* Quick Add / Suggested Friends */}
            {!debounced && <FindFriendsSection />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
