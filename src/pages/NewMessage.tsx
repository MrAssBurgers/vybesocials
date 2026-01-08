import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowLeft } from "lucide-react";
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
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
        active ? "bg-accent" : "hover:bg-accent"
      } disabled:opacity-50`}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={user.avatar_url || undefined} alt={user.username} />
        <AvatarFallback>{(user.display_name || user.username).charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{user.display_name || user.username}</div>
        <div className="text-sm text-muted-foreground truncate">@{user.username}</div>
      </div>
    </button>
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
              <div className="p-8 text-center text-muted-foreground">
                Type a username to start a chat.
              </div>
            )}
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
