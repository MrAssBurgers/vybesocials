/**
 * App Readiness Gate
 * 
 * Single global gate that blocks rendering until:
 * 1. Auth phase is resolved (not 'initializing')
 * 2. User data is rehydrated (for authenticated users)
 * 
 * Failsafes:
 * - Never crashes on backend errors
 * - Never logs user out on data fetch failures
 * - Always reaches a renderable state within timeout
 */

import { ReactNode, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { DataLoadErrorState } from "@/components/app/DataLoadErrorState";

type GateState = {
  dataLoading: boolean;
  appReady: boolean;
  step: string;
  progress: number;
  error: string | null;
  retryCount: number;
};

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

async function safe<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  try {
    return await retryOnce(() => withTimeout(fn(), timeoutMs, label));
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
  const { authReady, authPhase, user, profile } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  const [state, setState] = useState<GateState>({
    dataLoading: false,
    appReady: false, // Start blocked until auth resolves
    step: "Starting...",
    progress: 0,
    error: null,
    retryCount: 0,
  });

  const inFlightRef = useRef<Promise<void> | null>(null);
  const bootstrappedUserIdRef = useRef<string | null>(null);

  const routeConversationId = useMemo(() => {
    const match = location.pathname.match(/^\/messages\/([a-f0-9-]+)$/i);
    return match?.[1] ?? null;
  }, [location.pathname]);

  // PHASE A: Wait for auth to resolve
  useEffect(() => {
    // Auth still initializing - stay blocked
    if (!authReady || authPhase === 'initializing') {
      setState(s => ({ ...s, step: "Authenticating...", progress: 10 }));
      return;
    }

    // Auth resolved with error - still let app render
    if (authPhase === 'error') {
      console.warn('[AppGate] Auth resolved with error, allowing app to render');
      setState({
        dataLoading: false,
        appReady: true,
        step: "Ready",
        progress: 100,
        error: null,
        retryCount: 0,
      });
      bootstrappedUserIdRef.current = null;
      return;
    }

    // Unauthenticated - guest mode, render immediately
    if (authPhase === 'unauthenticated' || !user) {
      setState({
        dataLoading: false,
        appReady: true,
        step: "Ready",
        progress: 100,
        error: null,
        retryCount: 0,
      });
      bootstrappedUserIdRef.current = null;
      inFlightRef.current = null;
      return;
    }

    // Authenticated - check if data bootstrap is needed
    if (bootstrappedUserIdRef.current !== user.id && !inFlightRef.current) {
      setState(s => ({
        ...s,
        dataLoading: true,
        appReady: false,
        step: "Loading your data...",
        progress: 25,
        error: null,
      }));
    }
  }, [authReady, authPhase, user]);

  // PHASE B: Data rehydration for authenticated users
  const bootstrap = useCallback(async () => {
    if (!user?.id) return;

    const uid = user.id;
    
    setState(s => ({ ...s, step: "Loading profile...", progress: 35 }));

    // 1) Ensure profile exists
    const resolvedProfile = await safe(
      "resolve profile",
      async () => {
        if (profile?.id) return profile;
        await supabase.rpc("ensure_profile");
        const { data, error } = await supabase
          .from("profiles")
          .select("id, user_id, username, avatar_url, display_name, bio, onboarding_completed")
          .eq("user_id", uid)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      null as any
    );

    const profileId: string | null = resolvedProfile?.id ?? profile?.id ?? null;

    if (!profileId) {
      // No profile but user is logged in - allow app to render
      console.warn('[AppGate] No profile found, continuing anyway');
      setState({
        dataLoading: false,
        appReady: true,
        step: "Ready",
        progress: 100,
        error: null,
        retryCount: 0,
      });
      return;
    }

    queryClient.setQueryData(["profile", uid], resolvedProfile ?? profile);

    setState(s => ({ ...s, step: "Loading data...", progress: 50 }));

    // 2) Fetch core data in parallel with safe fallbacks
    await Promise.allSettled([
      // Friends
      safe("friends", async () => {
        const [asSender, asReceiver] = await Promise.all([
          supabase
            .from("friend_requests")
            .select("receiver:profiles!receiver_id(id, username, avatar_url, display_name)")
            .eq("sender_id", profileId)
            .eq("status", "accepted"),
          supabase
            .from("friend_requests")
            .select("sender:profiles!sender_id(id, username, avatar_url, display_name)")
            .eq("receiver_id", profileId)
            .eq("status", "accepted"),
        ]);
        const friends = [
          ...((asSender.data || []) as any[]).map((r) => r.receiver),
          ...((asReceiver.data || []) as any[]).map((r) => r.sender),
        ];
        queryClient.setQueryData(["friends", profileId], friends);
        return friends;
      }, []),

      // Conversations (simplified)
      safe("conversations", async () => {
        const { data, error } = await supabase
          .from("conversations")
          .select(`*, members:conversation_members(user_id, role, is_muted, is_pinned, last_read_at, profile:profiles(id, username, avatar_url, display_name))`)
          .order("updated_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        queryClient.setQueryData(["conversations", profileId], data || []);
        return data || [];
      }, []),

      // Notifications
      safe("notifications", async () => {
        const { data } = await supabase
          .from("notifications")
          .select("id, type, read, created_at, post_id, actor_id")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false })
          .limit(30);
        queryClient.setQueryData(["notifications", profileId], data || []);
        const unread = (data || []).filter((n: any) => !n.read).length;
        queryClient.setQueryData(["unread-notifications", profileId], unread);
        return data || [];
      }, []),

      // Posts
      safe("posts", async () => {
        const { data, error } = await supabase.rpc("get_posts_with_counts", {
          p_type: null,
          p_author_id: null,
          p_user_id: profileId,
          p_offset: 0,
          p_limit: 50,
        });
        if (error) throw error;
        const posts = (data || []).map(transformPost);
        queryClient.setQueryData(["infinite-posts", undefined, undefined, profileId], {
          pages: [{ posts, nextPage: posts.length >= 50 ? 1 : null, totalLoaded: posts.length }],
          pageParams: [0],
        });
        return posts;
      }, []),

      // Stories
      safe("stories", async () => {
        const { data } = await supabase
          .from("stories")
          .select("*, author:profiles!author_id(id, username, avatar_url, display_name)")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(50);
        queryClient.setQueryData(["stories", profileId], data || []);
        return data || [];
      }, []),

      // Mark online
      safe("presence", async () => {
        await supabase.from("user_presence").upsert(
          { user_id: profileId, is_online: true, last_seen_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
        return true;
      }, false),
    ]);

    // 3) Messages prefetch (optional - if on a message route)
    setState(s => ({ ...s, step: "Finishing up...", progress: 85 }));

    const conversations = queryClient.getQueryData<any[]>(["conversations", profileId]) || [];
    const firstConversationId = conversations?.[0]?.id ?? null;
    const convToPrefetch = routeConversationId || firstConversationId;

    if (convToPrefetch) {
      await safe("messages", async () => {
        const { data, error } = await supabase
          .from("messages")
          .select("*, sender:profiles!sender_id(id, username, avatar_url, display_name)")
          .eq("conversation_id", convToPrefetch)
          .eq("is_deleted", false)
          .order("created_at", { ascending: true })
          .limit(100);
        if (error) throw error;
        queryClient.setQueryData(["messages", convToPrefetch], data || []);
        return data || [];
      }, []);
    }

    setState({
      dataLoading: false,
      appReady: true,
      step: "Ready!",
      progress: 100,
      error: null,
      retryCount: 0,
    });
  }, [user, profile, queryClient, routeConversationId]);

  // Trigger bootstrap when authenticated
  useEffect(() => {
    if (!authReady) return;
    if (authPhase !== 'authenticated') return;
    if (!user?.id) return;
    if (bootstrappedUserIdRef.current === user.id) return;
    if (inFlightRef.current) return;

    bootstrappedUserIdRef.current = user.id;

    const p = bootstrap()
      .catch((err) => {
        console.error("[AppGate] Bootstrap failed:", err);
        // FAILSAFE: Don't brick the app - render anyway
        setState(s => ({
          ...s,
          dataLoading: false,
          appReady: true,
          step: "Ready (with errors)",
          progress: 100,
          error: err?.message || "Failed to load data",
        }));
      })
      .finally(() => {
        inFlightRef.current = null;
      });

    inFlightRef.current = p;
  }, [authReady, authPhase, user?.id, bootstrap]);

  // Retry handler
  const handleRetry = useCallback(() => {
    if (!user?.id) return;
    bootstrappedUserIdRef.current = null;
    inFlightRef.current = null;
    setState(s => ({
      ...s,
      dataLoading: true,
      appReady: false,
      step: "Retrying...",
      progress: 0,
      error: null,
      retryCount: s.retryCount + 1,
    }));
  }, [user]);

  const handleContinueAnyway = useCallback(() => {
    setState({
      dataLoading: false,
      appReady: true,
      step: "Ready",
      progress: 100,
      error: null,
      retryCount: 0,
    });
  }, []);

  // Render logic
  const showLoading = !state.appReady || state.dataLoading;
  const showError = state.error && !state.dataLoading && state.retryCount < MAX_RETRIES;

  if (showError) {
    return (
      <DataLoadErrorState
        error={state.error}
        onRetry={handleRetry}
        onContinue={handleContinueAnyway}
      />
    );
  }

  if (showLoading) {
    return <SplashScreen isVisible status={state.step} progress={state.progress} />;
  }

  return <>{children}</>;
}
