import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowLeft, Users, Check, Clock, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuth } from "@/lib/auth";
import { pushRecentMessageUser, RecentMessageUser } from "@/lib/recentMessageUsers";
import { useCreateConversation } from "@/hooks/useMessages";
import { useFriendshipStatus, useSendFriendRequest } from "@/hooks/useFriends";
import { cn } from "@/lib/utils";

function FriendshipBadge({ userId }: { userId: string }) {
  const { data: friendship } = useFriendshipStatus(userId);
  
  if (!friendship) return null;
  
  switch (friendship.status) {
    case 'friends':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500">
          <Check className="h-3 w-3" />
          Friends
        </span>
      );
    case 'pending_sent':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    case 'pending_received':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
          <UserPlus className="h-3 w-3" />
          Accept
        </span>
      );
    default:
      return null;
  }
}

function ResultRow({
  user,
  active,
  onSelect,
  disabled,
  id,
}: {
  user: RecentMessageUser;
  active: boolean;
  onSelect: () => void;
  disabled: boolean;
  id: string;
}) {
  const { data: friendship } = useFriendshipStatus(user.id);
  const sendRequest = useSendFriendRequest();
  const isFriends = friendship?.status === 'friends';
  
  const handleClick = () => {
    if (isFriends) {
      onSelect();
    }
  };

  const handleAddFriend = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendRequest.mutate(user.id);
  };

  return (
    <div
      id={id}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left transition-colors rounded-lg",
        active ? "bg-accent" : "hover:bg-accent/50",
        !isFriends && "opacity-75"
      )}
    >
      <button
        type="button"
        disabled={disabled || !isFriends}
        onClick={handleClick}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <Avatar className="h-10 w-10">
          <AvatarImage src={user.avatar_url || undefined} alt={user.username} />
          <AvatarFallback>{(user.display_name || user.username).charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate flex items-center gap-2">
            {user.display_name || user.username}
            <FriendshipBadge userId={user.id} />
          </div>
          <div className="text-sm text-muted-foreground truncate">@{user.username}</div>
        </div>
      </button>
      
      {friendship?.status === 'none' && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddFriend}
          disabled={sendRequest.isPending}
          className="shrink-0"
        >
          <UserPlus className="h-4 w-4 mr-1" />
          Add
        </Button>
      )}
    </div>
  );
}

export default function NewMessage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const createConversation = useCreateConversation();

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);

  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [debounced]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: results, isLoading } = useQuery({
    queryKey: ["new-message-user-search", debounced, profile?.id],
    queryFn: async () => {
      if (!debounced) return [] as RecentMessageUser[];
      if (!profile?.id) return [] as RecentMessageUser[];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, display_name")
        .neq("id", profile.id)
        .or(`username.ilike.%${debounced}%,display_name.ilike.%${debounced}%`)
        .order("username", { ascending: true })
        .limit(25);

      if (error) throw error;
      return (data || []) as RecentMessageUser[];
    },
    enabled: debounced.length > 0,
  });

  const safeResults = results || [];

  const selectUser = async (user: RecentMessageUser) => {
    if (!profile?.id) {
      toast.error("Please wait, loading your profile...");
      return;
    }
    try {
      pushRecentMessageUser(user);
      const conversation = await createConversation.mutateAsync({
        memberIds: [user.id],
      });
      navigate(`/messages/${conversation.id}`);
    } catch (e: any) {
      console.error("selectUser error:", e);
      toast.error(e?.message || "Failed to start conversation");
    }
  };

  const activeUser = useMemo(() => safeResults[activeIndex], [safeResults, activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!safeResults.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, safeResults.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (activeUser) void selectUser(activeUser);
    }
  };

  useEffect(() => {
    const el = document.getElementById(`new-msg-row-${activeIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <AppLayout>
      <div className="h-[calc(100vh-5rem)] md:h-screen flex flex-col max-w-2xl mx-auto">
        <header className="p-4 border-b border-border flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/messages")}
            aria-label="Back to messages"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">New Chat</h1>
          </div>
        </header>

        <main className="p-4 space-y-3">
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

          <section className="rounded-xl border border-border overflow-hidden">
            {isLoading ? (
              <div className="p-2 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : debounced && safeResults.length > 0 ? (
              <div className="max-h-[60vh] overflow-y-auto">
                {safeResults.map((u, idx) => (
                  <ResultRow
                    key={u.id}
                    id={`new-msg-row-${idx}`}
                    user={u}
                    active={idx === activeIndex}
                    disabled={createConversation.isPending}
                    onSelect={() => selectUser(u)}
                  />
                ))}
              </div>
            ) : debounced ? (
              <div className="p-8 text-center text-muted-foreground">
                No users found.
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Users className="h-8 w-8 opacity-50" />
                <p>Type a username to find friends</p>
                <p className="text-xs">You can only message friends</p>
              </div>
            )}
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
