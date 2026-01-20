import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SplashScreen } from "@/components/ui/SplashScreen";

type GateState = {
  authLoading: boolean;
  dataLoading: boolean;
  appReady: boolean;
  step: string;
  progress: number;
};

const DEFAULT_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
}

async function retryOnce<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<T> {
  try {
    return await retryOnce(label, () => withTimeout(fn(), timeoutMs, label));
  } catch (e) {
    console.warn(`[AppGate] ${label} failed (using fallback):`, e);
    return fallback;
  }
}

function transformPost(row: any) {
  return {
    id: row.id,
    type: row.type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    caption: row.caption || "",
    tags: row.tags || [],
    created_at: row.created_at,
    is_pinned: row.is_pinned,
    author: {
      id: row.author_id,
      username: row.author_username,
      avatar_url: row.author_avatar_url,
    },
    like_count: Number(row.like_count) || 0,
    comment_count: Number(row.comment_count) || 0,
    is_liked: row.is_liked || false,
    is_bookmarked: row.is_bookmarked || false,
  };
}

export function AppReadinessGate({ children }: { children: ReactNode }) {
  const { authReady, user, profile } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  // Start ready for guests; only block if we detect a user session
  const [state, setState] = useState<GateState>(() => ({
    authLoading: false,
    dataLoading: false,
    appReady: true,
    step: "Ready",
    progress: 100,
  }));

  const inFlightRef = useRef<Promise<void> | null>(null);
  const bootstrappedUserIdRef = useRef<string | null>(null);

  const routeConversationId = useMemo(() => {
    const match = location.pathname.match(/^\/messages\/([a-f0-9-]+)$/i);
    return match?.[1] ?? null;
  }, [location.pathname]);

  // A) + B) Auth loading gate - only show loading when there's a user session to bootstrap
  useEffect(() => {
    // If auth not resolved yet but we already have cached user, start loading state
    if (!authReady) {
      // Don't block guests - only block if we know there's a user
      return;
    }

    // Auth resolved with no user = guest, stay ready
    if (!user) {
      setState({
        authLoading: false,
        dataLoading: false,
        appReady: true,
        step: "Ready",
        progress: 100,
      });
      bootstrappedUserIdRef.current = null;
      inFlightRef.current = null;
      return;
    }

    // Auth resolved with user - if not yet bootstrapped, start loading
    if (bootstrappedUserIdRef.current !== user.id && !inFlightRef.current) {
      setState((s) => ({
        ...s,
        authLoading: false,
        dataLoading: true,
        appReady: false,
        step: "Loading your session…",
        progress: 25,
      }));
    }
  }, [authReady, user]);

  // C) Full data rehydration on login (and on cold start when already signed-in)
  useEffect(() => {
    if (!authReady) return;

    // No user session => app can render immediately
    if (!user?.id) {
      setState((s) => ({ ...s, dataLoading: false, appReady: true, progress: 100 }));
      bootstrappedUserIdRef.current = null;
      return;
    }

    // Already bootstrapped for this user - skip
    if (bootstrappedUserIdRef.current === user.id) return;

    // Avoid duplicate bootstraps (StrictMode double-invokes effects)
    if (inFlightRef.current) return;

    // Mark that we are bootstrapping this user
    bootstrappedUserIdRef.current = user.id;

    const bootstrap = async () => {
      setState((s) => ({
        ...s,
        dataLoading: true,
        appReady: false,
        step: "Loading profile…",
        progress: 35,
      }));

      // 1) Ensure we have a profile row + profile id
      const resolvedProfile = await safe(
        "resolve profile",
        async () => {
          // If AuthProvider already has it, trust it.
          if (profile?.id) return profile;

          // Ensure profile row exists for this auth user.
          await supabase.rpc("ensure_profile");
          const { data, error } = await supabase
            .from("profiles")
            .select("id, user_id, username, avatar_url, display_name, bio, onboarding_completed")
            .eq("user_id", user.id)
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        null as any
      );

      const profileId: string | null = resolvedProfile?.id ?? profile?.id ?? null;

      if (!profileId) {
        // Fail-safe: don't brick the app; let UI render with safe empty states.
        setState((s) => ({
          ...s,
          dataLoading: false,
          appReady: true,
          step: "Ready!",
          progress: 100,
        }));
        return;
      }

      // Seed a small cache for profile (used by some code paths)
      queryClient.setQueryData(["profile", user.id], resolvedProfile ?? profile);

      setState((s) => ({ ...s, step: "Rehydrating data…", progress: 50 }));

      // 2) Fetch core data in parallel (with retry + safe fallbacks)
      const coreTasks = await Promise.allSettled([
        // Friends
        safe(
          "friends",
          async () => {
            const [asSender, asReceiver] = await Promise.all([
              supabase
                .from("friend_requests")
                .select(`receiver:profiles!receiver_id(id, username, avatar_url, display_name)`)
                .eq("sender_id", profileId)
                .eq("status", "accepted"),
              supabase
                .from("friend_requests")
                .select(`sender:profiles!sender_id(id, username, avatar_url, display_name)`)
                .eq("receiver_id", profileId)
                .eq("status", "accepted"),
            ]);

            const friends = [
              ...((asSender.data || []) as any[]).map((r) => r.receiver),
              ...((asReceiver.data || []) as any[]).map((r) => r.sender),
            ];

            queryClient.setQueryData(["friends", profileId], friends);
            return friends;
          },
          [] as any[]
        ),

        // Friend requests
        safe(
          "friend requests",
          async () => {
            const [incoming, outgoing] = await Promise.all([
              supabase
                .from("friend_requests")
                .select(`*, sender:profiles!sender_id(id, username, avatar_url, display_name)`)
                .eq("receiver_id", profileId)
                .eq("status", "pending")
                .order("created_at", { ascending: false }),
              supabase
                .from("friend_requests")
                .select(`*, receiver:profiles!receiver_id(id, username, avatar_url, display_name)`)
                .eq("sender_id", profileId)
                .eq("status", "pending")
                .order("created_at", { ascending: false }),
            ]);

            if (incoming.error) throw incoming.error;
            if (outgoing.error) throw outgoing.error;

            const payload = {
              incoming: (incoming.data || []) as any[],
              outgoing: (outgoing.data || []) as any[],
            };

            queryClient.setQueryData(["friend-requests", profileId], payload);
            return payload;
          },
          { incoming: [], outgoing: [] }
        ),

        // Conversations
        safe(
          "conversations",
          async () => {
            const [hiddenResult, conversationsResult] = await Promise.all([
              supabase
                .from("hidden_conversations")
                .select("conversation_id")
                .eq("user_id", profileId),
              supabase
                .from("conversations")
                .select(
                  `*,
                   members:conversation_members(
                     user_id,
                     role,
                     is_muted,
                     is_pinned,
                     last_read_at,
                     profile:profiles(id, username, avatar_url, display_name)
                   )`
                )
                .order("updated_at", { ascending: false }),
            ]);

            if (conversationsResult.error) throw conversationsResult.error;

            const hiddenIds = new Set((hiddenResult.data || []).map((h: any) => h.conversation_id));
            const conversations = (conversationsResult.data || []).filter((c: any) => !hiddenIds.has(c.id));

            if (!conversations.length) {
              queryClient.setQueryData(["conversations", profileId], []);
              return [] as any[];
            }

            const convIds = conversations.map((c: any) => c.id);

            // Fetch messages for all convs to compute last_message + unread_count (matches existing hook behavior)
            const { data: allMessages } = await supabase
              .from("messages")
              .select("*")
              .in("conversation_id", convIds)
              .eq("is_deleted", false)
              .order("created_at", { ascending: false });

            const lastMessageMap = new Map<string, any>();
            (allMessages || []).forEach((msg: any) => {
              if (!lastMessageMap.has(msg.conversation_id)) lastMessageMap.set(msg.conversation_id, msg);
            });

            const result = conversations.map((conv: any) => {
              const memberRecord = conv.members?.find((m: any) => m.user_id === profileId);
              const lastReadAt = memberRecord?.last_read_at || "1970-01-01";
              const unreadCount = (allMessages || []).filter(
                (msg: any) =>
                  msg.conversation_id === conv.id &&
                  msg.sender_id !== profileId &&
                  msg.created_at > lastReadAt
              ).length;

              const lastMessage = lastMessageMap.get(conv.id) || null;

              return {
                ...conv,
                last_message: lastMessage,
                unread_count: unreadCount,
                _sortTime: lastMessage?.created_at || conv.updated_at,
              };
            });

            result.sort((a: any, b: any) => new Date(b._sortTime).getTime() - new Date(a._sortTime).getTime());

            queryClient.setQueryData(["conversations", profileId], result);
            return result;
          },
          [] as any[]
        ),

        // Notifications (+ unread)
        safe(
          "notifications",
          async () => {
            const { data, error } = await supabase
              .from("notifications")
              .select("id,type,read,created_at,post_id,actor_id")
              .eq("user_id", profileId)
              .order("created_at", { ascending: false })
              .limit(30);
            if (error) throw error;

            const rows = data || [];
            if (!rows.length) {
              queryClient.setQueryData(["notifications", profileId], []);
              queryClient.setQueryData(["unread-notifications", profileId], 0);
              return [];
            }

            const actorIds = [...new Set(rows.map((n: any) => n.actor_id))];
            const { data: actors } = await supabase
              .from("profiles")
              .select("id, username, avatar_url, display_name")
              .in("id", actorIds);

            const actorMap = new Map((actors || []).map((a: any) => [a.id, a]));
            const normalized = rows.map((n: any) => ({
              id: n.id,
              type: n.type,
              read: n.read,
              created_at: n.created_at,
              post_id: n.post_id,
              actor: actorMap.get(n.actor_id) || {
                id: n.actor_id,
                username: "unknown",
                avatar_url: null,
                display_name: null,
              },
            }));

            queryClient.setQueryData(["notifications", profileId], normalized);

            const unread = normalized.reduce((acc: number, n: any) => acc + (n.read ? 0 : 1), 0);
            queryClient.setQueryData(["unread-notifications", profileId], unread);

            return normalized;
          },
          [] as any[]
        ),

        // Stories
        safe(
          "stories",
          async () => {
            const [asSender, asReceiver] = await Promise.all([
              supabase
                .from("friend_requests")
                .select("receiver_id")
                .eq("sender_id", profileId)
                .eq("status", "accepted"),
              supabase
                .from("friend_requests")
                .select("sender_id")
                .eq("receiver_id", profileId)
                .eq("status", "accepted"),
            ]);

            const friendIds = new Set<string>([
              ...((asSender.data || []) as any[]).map((r) => r.receiver_id),
              ...((asReceiver.data || []) as any[]).map((r) => r.sender_id),
            ]);

            const allowedIds = [profileId, ...Array.from(friendIds)];

            const { data, error } = await supabase
              .from("stories")
              .select(`*, author:profiles!author_id(id, username, avatar_url, display_name)`)
              .in("author_id", allowedIds)
              .gt("expires_at", new Date().toISOString())
              .order("created_at", { ascending: false });
            if (error) throw error;

            const { data: views } = await supabase
              .from("story_views")
              .select("story_id")
              .eq("viewer_id", profileId);
            const viewedIds = new Set((views || []).map((v: any) => v.story_id));

            const storiesWithViews = (data || []).map((story: any) => ({
              ...story,
              has_viewed: viewedIds.has(story.id),
            }));

            const groupedMap = new Map<string, any>();
            for (const story of storiesWithViews) {
              const authorId = story.author_id;
              if (!groupedMap.has(authorId)) {
                groupedMap.set(authorId, {
                  user: story.author,
                  stories: [],
                  hasUnviewed: false,
                });
              }
              const group = groupedMap.get(authorId);
              group.stories.push(story);
              if (!story.has_viewed) group.hasUnviewed = true;
            }

            const groups = Array.from(groupedMap.values());
            groups.sort((a: any, b: any) => {
              if (a.user.id === profileId) return -1;
              if (b.user.id === profileId) return 1;
              if (a.hasUnviewed && !b.hasUnviewed) return -1;
              if (!a.hasUnviewed && b.hasUnviewed) return 1;
              return 0;
            });

            queryClient.setQueryData(["stories", profileId], groups);
            return groups;
          },
          [] as any[]
        ),

        // Posts (global feed + following feed)
        safe(
          "posts",
          async () => {
            const [feed, following] = await Promise.all([
              supabase.rpc("get_posts_with_counts", {
                p_type: null,
                p_author_id: null,
                p_user_id: profileId,
                p_offset: 0,
                p_limit: 100,
              }),
              supabase.rpc("get_following_posts_with_counts", {
                p_user_id: profileId,
                p_type: null,
                p_offset: 0,
                p_limit: 100,
              }),
            ]);

            if (feed.error) throw feed.error;
            const feedPosts = (feed.data || []).map(transformPost);
            queryClient.setQueryData(["infinite-posts", undefined, undefined, profileId], {
              pages: [
                {
                  posts: feedPosts,
                  nextPage: feedPosts.length >= 100 ? 1 : null,
                  totalLoaded: feedPosts.length,
                },
              ],
              pageParams: [0],
            });

            if (!following.error) {
              const followingPosts = (following.data || []).map(transformPost);
              queryClient.setQueryData(["infinite-following-posts", undefined, profileId], {
                pages: [
                  {
                    posts: followingPosts,
                    nextPage: followingPosts.length >= 100 ? 1 : null,
                  },
                ],
                pageParams: [0],
              });
            }

            return feedPosts;
          },
          [] as any[]
        ),

        // Invite/referral state
        safe(
          "invite/referral",
          async () => {
            // my-invite
            const { data: existingInvite } = await supabase
              .from("invites")
              .select("*")
              .eq("inviter_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            queryClient.setQueryData(["my-invite", user.id], existingInvite ?? null);

            // invite-stats
            const { data: invites } = await supabase
              .from("invites")
              .select("id, use_count")
              .eq("inviter_id", user.id);

            if (!invites?.length) {
              queryClient.setQueryData(["invite-stats", user.id], { totalRedemptions: 0, recentRedemptions: [] });
              return null;
            }

            const totalFromInvites = invites.reduce((sum: number, inv: any) => sum + (inv.use_count || 0), 0);
            const inviteIds = invites.map((i: any) => i.id);

            const { count } = await supabase
              .from("invite_redemptions")
              .select("*", { count: "exact", head: true })
              .in("invite_id", inviteIds);

            const totalRedemptions = Math.max(totalFromInvites, count || 0);

            const { data: recentRedemptions } = await supabase
              .from("invite_redemptions")
              .select("id, redeemed_at, redeemer_id")
              .in("invite_id", inviteIds)
              .order("redeemed_at", { ascending: false })
              .limit(10);

            const redemptionsWithProfiles = await Promise.all(
              (recentRedemptions || []).map(async (r: any) => {
                const { data: redeemerProfile } = await supabase
                  .from("profiles")
                  .select("username, avatar_url")
                  .eq("user_id", r.redeemer_id)
                  .single();
                return { ...r, profile: redeemerProfile };
              })
            );

            queryClient.setQueryData(["invite-stats", user.id], {
              totalRedemptions,
              recentRedemptions: redemptionsWithProfiles,
            });

            return null;
          },
          null
        ),

        // Presence state (mark online)
        safe(
          "presence",
          async () => {
            await supabase
              .from("user_presence")
              .upsert(
                {
                  user_id: profileId,
                  is_online: true,
                  last_seen_at: new Date().toISOString(),
                },
                { onConflict: "user_id" }
              );
            return true;
          },
          false
        ),
      ]);

      // 3) Messages prefetch (best-effort): current convo, otherwise most recent convo
      setState((s) => ({ ...s, step: "Loading messages…", progress: 80 }));

      const conversations = queryClient.getQueryData<any[]>(["conversations", profileId]) || [];
      const firstConversationId = conversations?.[0]?.id ?? null;
      const convToPrefetch = routeConversationId || firstConversationId;

      if (convToPrefetch) {
        await safe(
          "messages",
          async () => {
            const { data, error } = await supabase
              .from("messages")
              .select(
                `*,
                 sender:profiles!sender_id(id, username, avatar_url, display_name),
                 views:message_views(user_id, viewed_at, profile:profiles!user_id(id, username, avatar_url, display_name)),
                 reactions:message_reactions(user_id, emoji)`
              )
              .eq("conversation_id", convToPrefetch)
              .eq("is_deleted", false)
              .order("created_at", { ascending: true });

            if (error) throw error;

            const filtered = (data || []).filter((msg: any) => {
              if (msg.view_mode === "view_once" && msg.sender_id !== profileId) {
                const hasViewed = msg.views?.some((v: any) => v.user_id === profileId);
                if (hasViewed) return false;
              }
              if (msg.expires_at && new Date(msg.expires_at) < new Date()) return false;
              return true;
            });

            queryClient.setQueryData(["messages", convToPrefetch], filtered);
            return filtered;
          },
          [] as any[]
        );
      }

      setState((s) => ({
        ...s,
        dataLoading: false,
        appReady: true,
        step: "Ready!",
        progress: 100,
      }));
    };

    const p = bootstrap().catch((err) => {
      console.error("[AppGate] Bootstrap failed:", err);
      // Don't brick the app - render anyway
      setState((s) => ({
        ...s,
        dataLoading: false,
        appReady: true,
        step: "Ready (with errors)",
        progress: 100,
      }));
    }).finally(() => {
      inFlightRef.current = null;
    });

    inFlightRef.current = p;
  }, [authReady, user?.id, profile?.id, queryClient, profile, routeConversationId]);

  const showLoading = state.authLoading || state.dataLoading || !state.appReady;

  if (showLoading) {
    return <SplashScreen isVisible status={state.step} progress={state.progress} />;
  }

  return <>{children}</>;
}
