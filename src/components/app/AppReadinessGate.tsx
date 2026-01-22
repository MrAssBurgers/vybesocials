/**
 * App Readiness Gate
 * 
 * Ensures auth is resolved before rendering app, then loads data in background.
 * NEVER blocks longer than timeout. NEVER logs user out on data failures.
 */

import { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SplashScreen } from "@/components/ui/SplashScreen";

type GatePhase = 'auth' | 'data' | 'ready';

const MAX_WAIT_MS = 5000; // 5 second hard cap
const DATA_TIMEOUT_MS = 4000; // 4 seconds per data fetch

// Transform post data
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

// Safe fetch with timeout
async function safeFetch<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const result = await Promise.race([
      fn(),
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), DATA_TIMEOUT_MS)),
    ]);
    return result;
  } catch (e) {
    console.warn(`[AppGate] ${label} failed:`, e);
    return fallback;
  }
}

export function AppReadinessGate({ children }: { children: ReactNode }) {
  const { authReady, authPhase, user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  const [phase, setPhase] = useState<GatePhase>('auth');
  const [step, setStep] = useState("Starting...");
  const bootstrappedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  // Hard failsafe - NEVER block forever
  useEffect(() => {
    const timer = setTimeout(() => {
      if (phase !== 'ready') {
        console.warn('[AppGate] Failsafe timeout - forcing ready');
        setPhase('ready');
      }
    }, MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Phase A: Wait for auth
  useEffect(() => {
    if (!authReady || authPhase === 'initializing') {
      setStep("Signing you in...");
      return;
    }

    // Auth resolved
    if (authPhase === 'error' || authPhase === 'unauthenticated' || !user) {
      // Guest or error - render immediately
      setPhase('ready');
      return;
    }

    // Authenticated - start data loading
    if (phase === 'auth') {
      setPhase('data');
      setStep("Loading your data...");
    }
  }, [authReady, authPhase, user, phase]);

  // Phase B: Load data
  const bootstrap = useCallback(async () => {
    if (!user?.id) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      // Get or ensure profile
      let profileId = profile?.id;
      
      if (!profileId) {
        setStep("Setting up profile...");
        
        const ensuredProfile = await safeFetch("profile", async () => {
          await supabase.rpc("ensure_profile");
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          return data;
        }, null);

        if (ensuredProfile) {
          profileId = ensuredProfile.id;
          queryClient.setQueryData(["profile", user.id], ensuredProfile);
          refreshProfile().catch(() => {});
        }
      }

      // If still no profile, render anyway
      if (!profileId) {
        console.warn('[AppGate] No profile, rendering with limited features');
        setPhase('ready');
        return;
      }

      setStep("Loading data...");

      // Load user data in parallel
      await Promise.allSettled([
        safeFetch("friends", async () => {
          const [asSender, asReceiver] = await Promise.all([
            supabase.from("friend_requests").select("receiver:profiles!receiver_id(id, username, avatar_url, display_name)").eq("sender_id", profileId).eq("status", "accepted"),
            supabase.from("friend_requests").select("sender:profiles!sender_id(id, username, avatar_url, display_name)").eq("receiver_id", profileId).eq("status", "accepted"),
          ]);
          const friends = [...(asSender.data || []).map((r: any) => r.receiver), ...(asReceiver.data || []).map((r: any) => r.sender)];
          queryClient.setQueryData(["friends", profileId], friends);
        }, null),

        safeFetch("conversations", async () => {
          const { data } = await supabase.from("conversations").select("*, members:conversation_members(user_id, role, profile:profiles(id, username, avatar_url, display_name))").order("updated_at", { ascending: false }).limit(50);
          queryClient.setQueryData(["conversations", profileId], data || []);
        }, null),

        safeFetch("notifications", async () => {
          const { data } = await supabase.from("notifications").select("id, type, read, created_at, post_id, actor_id").eq("user_id", profileId).order("created_at", { ascending: false }).limit(30);
          queryClient.setQueryData(["notifications", profileId], data || []);
          queryClient.setQueryData(["unread-notifications", profileId], (data || []).filter((n: any) => !n.read).length);
        }, null),

        safeFetch("posts", async () => {
          const { data } = await supabase.rpc("get_posts_with_counts", { p_type: null, p_author_id: null, p_user_id: profileId, p_offset: 0, p_limit: 50 });
          const posts = (data || []).map(transformPost);
          queryClient.setQueryData(["infinite-posts", undefined, undefined, profileId], {
            pages: [{ posts, nextPage: posts.length >= 50 ? 1 : null, totalLoaded: posts.length }],
            pageParams: [0],
          });
        }, null),
      ]);

      setPhase('ready');
    } catch (e) {
      console.error('[AppGate] Bootstrap error:', e);
      setPhase('ready'); // Render anyway
    } finally {
      inFlightRef.current = false;
    }
  }, [user, profile, queryClient, refreshProfile]);

  // Trigger bootstrap
  useEffect(() => {
    if (phase !== 'data') return;
    if (!user?.id) return;
    if (bootstrappedRef.current === user.id) return;
    
    bootstrappedRef.current = user.id;
    bootstrap();
  }, [phase, user?.id, bootstrap]);

  // Render
  if (phase !== 'ready') {
    return <SplashScreen isVisible={true} status={step} progress={phase === 'data' ? 50 : 20} />;
  }

  return <>{children}</>;
}
