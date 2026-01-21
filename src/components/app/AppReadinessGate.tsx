/**
 * App Readiness Gate
 * 
 * Single global gate that blocks rendering until:
 * 1. Auth phase is resolved (not 'initializing')
 * 2. Profile is guaranteed to exist (for authenticated users)
 * 3. User data is rehydrated (for authenticated users)
 * 
 * Failsafes:
 * - Never crashes on backend errors
 * - Never logs user out on data fetch failures
 * - Always reaches a renderable state within timeout
 * - Auto-creates profile if missing
 * - NEVER keeps loading screen forever
 */

import { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { DataLoadErrorState } from "@/components/app/DataLoadErrorState";
import { toast } from "sonner";

type GateState = {
  phase: 'auth' | 'profile' | 'data' | 'ready' | 'error';
  step: string;
  progress: number;
  error: string | null;
  retryCount: number;
};

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const MAX_TOTAL_WAIT_MS = 8000; // Hard cap: never block longer than 8s

// Wrap promise with timeout
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

// Retry once on failure
async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

// Safe wrapper that never throws - always returns fallback on error
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

// Transform post data from RPC
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
  const { authReady, authPhase, user, profile, profileLoading, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  const [state, setState] = useState<GateState>({
    phase: 'auth',
    step: "Starting...",
    progress: 0,
    error: null,
    retryCount: 0,
  });

  const inFlightRef = useRef<Promise<void> | null>(null);
  const bootstrappedUserIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const forcedReadyRef = useRef(false);
  const phaseRef = useRef<GateState['phase']>('auth');

  // Get conversation ID from route if on messages page
  const routeConversationId = (() => {
    const match = location.pathname.match(/^\/messages\/([a-f0-9-]+)$/i);
    return match?.[1] ?? null;
  })();

  // Keep a ref of the latest phase so our failsafe timer doesn't rely on stale closures
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  // FAILSAFE: single hard cap timer (does NOT reset per-phase)
  useEffect(() => {
    forcedReadyRef.current = false;
    const timer = window.setTimeout(() => {
      if (phaseRef.current !== 'ready' && !forcedReadyRef.current) {
        forcedReadyRef.current = true;
        console.warn('[AppGate] Maximum wait time exceeded, forcing app ready');
        toast.message('Some data is still loading');
        setState({
          phase: 'ready',
          step: "Ready",
          progress: 100,
          error: null,
          retryCount: 0,
        });
      }
    }, MAX_TOTAL_WAIT_MS);

    return () => window.clearTimeout(timer);
  }, [user?.id, state.retryCount]);

  // PHASE A: Wait for auth to resolve
  useEffect(() => {
    // Reset start time on each auth check
    if (!authReady || authPhase === 'initializing') {
      setState(s => ({ ...s, phase: 'auth', step: "Authenticating...", progress: 10 }));
      return;
    }

    // Auth resolved with error - still let app render
    if (authPhase === 'error') {
      console.warn('[AppGate] Auth resolved with error, allowing app to render');
      setState({
        phase: 'ready',
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
        phase: 'ready',
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
        phase: 'profile',
        step: "Loading profile...",
        progress: 20,
        error: null,
      }));
    }
  }, [authReady, authPhase, user]);

  // PHASE B: Ensure profile exists + rehydrate data
  const bootstrap = useCallback(async () => {
    if (!user?.id) return;

    const uid = user.id;
    
    // Step 1: Ensure profile exists
    setState(s => ({ ...s, phase: 'profile', step: "Loading profile...", progress: 25 }));

    let profileId: string | null = profile?.id ?? null;

    // If no profile in context OR profile is still loading, ensure it exists
    if (!profileId) {
      const ensuredProfile = await safe(
        "ensure-profile",
        async () => {
          // Call ensure_profile RPC to create if missing
          const { data: ensuredId, error: ensureError } = await supabase.rpc("ensure_profile");
          if (ensureError) throw ensureError;
          
          // Fetch the profile
          const { data, error } = await supabase
            .from("profiles")
            .select("id, user_id, username, avatar_url, display_name, bio, onboarding_completed, tutorial_completed, created_at")
            .eq("user_id", uid)
            .maybeSingle();
            
          if (error) throw error;
          return data;
        },
        null,
        8000 // 8 second timeout for profile
      );

      if (ensuredProfile) {
        profileId = ensuredProfile.id;
        queryClient.setQueryData(["profile", uid], ensuredProfile);
        
        // Trigger auth context refresh to sync profile state
        try {
          await refreshProfile();
        } catch {
          // Non-critical - continue with local profile
        }
      }
    } else {
      // Cache existing profile
      queryClient.setQueryData(["profile", uid], profile);
    }

    // If still no profile after trying, continue anyway - user can retry later
    if (!profileId) {
      console.warn('[AppGate] No profile available, continuing with limited functionality');
      if (!forcedReadyRef.current) {
        forcedReadyRef.current = true;
        toast.message('Some data is still loading');
      }
      // Don't block the app - just continue
      setState({
        phase: 'ready',
        step: "Ready",
        progress: 100,
        error: null,
        retryCount: 0,
      });
      return;
    }

    // Step 2: Load all user data in parallel with short timeouts
    setState(s => ({ ...s, phase: 'data', step: "Loading your data...", progress: 40 }));

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
      }, [], 6000),

      // Friend requests (incoming + outgoing)
      safe("friend-requests", async () => {
        const [incoming, outgoing] = await Promise.all([
          supabase
            .from("friend_requests")
            .select("*, sender:profiles!sender_id(id, username, avatar_url, display_name)")
            .eq("receiver_id", profileId)
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
          supabase
            .from("friend_requests")
            .select("*, receiver:profiles!receiver_id(id, username, avatar_url, display_name)")
            .eq("sender_id", profileId)
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
        ]);
        const payload = { incoming: incoming.data || [], outgoing: outgoing.data || [] };
        queryClient.setQueryData(["friend-requests", profileId], payload);
        return payload;
      }, { incoming: [], outgoing: [] }, 6000),

      // Conversations
      safe("conversations", async () => {
        const { data, error } = await supabase
          .from("conversations")
          .select(`*, members:conversation_members(user_id, role, is_muted, is_pinned, last_read_at, profile:profiles(id, username, avatar_url, display_name))`)
          .order("updated_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        queryClient.setQueryData(["conversations", profileId], data || []);
        return data || [];
      }, [], 6000),

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
      }, [], 5000),

      // Posts - with shorter timeout as it's less critical
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
      }, [], 5000),

      // Stories - non-critical
      safe("stories", async () => {
        const { data } = await supabase
          .from("stories")
          .select("*, author:profiles!author_id(id, username, avatar_url, display_name)")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(50);
        queryClient.setQueryData(["stories", profileId], data || []);
        return data || [];
      }, [], 5000),
    ]);

    // Step 3: Mark presence (fire and forget)
    setState(s => ({ ...s, step: "Finishing up...", progress: 85 }));

    // Don't wait for presence - just fire it
    void (async () => {
      try {
        await supabase.from("user_presence").upsert(
          { user_id: profileId, is_online: true, last_seen_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      } catch {
        // Ignore presence errors
      }
    })();

    // Step 4: Prefetch messages for current/first conversation (non-blocking)
    const conversations = queryClient.getQueryData<any[]>(["conversations", profileId]) || [];
    const firstConversationId = conversations?.[0]?.id ?? null;
    const convToPrefetch = routeConversationId || firstConversationId;

    if (convToPrefetch) {
      // Fire and forget - don't block app ready
      safe("messages", async () => {
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
      }, [], 5000);
    }

    // Done!
    setState({
      phase: 'ready',
      step: "Ready!",
      progress: 100,
      error: null,
      retryCount: 0,
    });
  }, [user, profile, queryClient, routeConversationId, refreshProfile]);

  // Trigger bootstrap when authenticated
  useEffect(() => {
    if (!authReady) return;
    if (authPhase !== 'authenticated') return;
    if (!user?.id) return;
    if (bootstrappedUserIdRef.current === user.id) return;
    if (inFlightRef.current) return;

    // Don't wait for profile loading to complete - bootstrap can handle it
    bootstrappedUserIdRef.current = user.id;

    const p = bootstrap()
      .catch((err) => {
        console.error("[AppGate] Bootstrap failed:", err);
        // FAILSAFE: Don't brick the app - render anyway
        setState({
          phase: 'ready',
          step: "Ready",
          progress: 100,
          error: null, // Don't show error - just continue
          retryCount: 0,
        });
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
    startTimeRef.current = Date.now();
    forcedReadyRef.current = false;
    setState(s => ({
      ...s,
      phase: 'profile',
      step: "Retrying...",
      progress: 0,
      error: null,
      retryCount: s.retryCount + 1,
    }));
  }, [user]);

  // Continue anyway (skip data loading)
  const handleContinueAnyway = useCallback(() => {
    setState({
      phase: 'ready',
      step: "Ready",
      progress: 100,
      error: null,
      retryCount: 0,
    });
  }, []);

  // Render logic - only show error if explicitly set AND under retry limit
  const isLoading = state.phase !== 'ready' && state.phase !== 'error';
  const showError = state.phase === 'error' && state.error && state.retryCount < MAX_RETRIES;

  if (showError) {
    return (
      <DataLoadErrorState
        error={state.error}
        onRetry={handleRetry}
        onContinue={handleContinueAnyway}
      />
    );
  }

  if (isLoading) {
    return <SplashScreen isVisible status={state.step} progress={state.progress} />;
  }

  return <>{children}</>;
}
