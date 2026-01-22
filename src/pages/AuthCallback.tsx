import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, storageStatus } from "@/integrations/supabase/client";
import { getUserFriendlyError } from "@/lib/errorUtils";
import { Button } from "@/components/ui/button";

const AUTH_STORAGE_KEY = 'vybe-auth-token';

// Verify session is actually persisted to storage
function verifySessionPersisted(): boolean {
  try {
    const storage = storageStatus.localStorageAvailable ? localStorage : sessionStorage;
    const stored = storage.getItem(AUTH_STORAGE_KEY);
    return !!stored && stored.length > 10;
  } catch {
    return false;
  }
}

// Ensure profile exists with retry logic
async function ensureProfileWithRetry(maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[AuthCallback] ensure_profile attempt ${attempt}/${maxAttempts}`);
      const { error } = await supabase.rpc("ensure_profile");
      if (!error) {
        // Verify profile actually exists
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('user_id', session.session.user.id)
            .maybeSingle();
          
          if (profile?.id) {
            console.log('[AuthCallback] Profile confirmed:', profile.id);
            return true;
          }
        }
      }
      console.warn(`[AuthCallback] ensure_profile attempt ${attempt} failed or profile not found`);
    } catch (err) {
      console.warn(`[AuthCallback] ensure_profile attempt ${attempt} error:`, err);
    }
    // Wait before retry (exponential backoff)
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
  return false;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Processing...");

  const nextPath = useMemo(() => {
    const next = searchParams.get("next") || "/home";
    return next.startsWith("/") ? next : "/home";
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    // Hard timeout - NEVER hang more than 8 seconds
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      console.warn('[AuthCallback] Timeout exceeded, navigating anyway');
      navigate(nextPath, { replace: true });
    }, 8000);

    (async () => {
      try {
        const url = new URL(window.location.href);

        // Check for OAuth errors in URL
        const errorDesc = url.searchParams.get("error_description");
        const errorCode = url.searchParams.get("error");
        if (errorDesc || errorCode) {
          throw new Error(decodeURIComponent(errorDesc || errorCode || "Authentication failed"));
        }

        // Exchange OAuth code for session
        const code = url.searchParams.get("code");
        if (code) {
          setStatus("Signing you in...");
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        // Verify session exists
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (!session?.user) {
          throw new Error("No session was created");
        }

        // CRITICAL: Verify the session was actually persisted to storage
        setStatus("Verifying session...");
        await new Promise(resolve => setTimeout(resolve, 100)); // Let storage settle
        
        const isPersisted = verifySessionPersisted();
        console.log('[AuthCallback] Session persisted:', isPersisted, 'Storage status:', storageStatus);
        
        if (!isPersisted) {
          // Session exists in memory but not in storage - this is the bug!
          if (!storageStatus.localStorageAvailable) {
            console.warn('[AuthCallback] Using sessionStorage fallback - session won\'t persist across tabs');
          } else {
            console.error('[AuthCallback] Session not persisted despite localStorage being available');
          }
        }

        // CRITICAL: Wait for profile to be created/confirmed before navigating
        setStatus("Setting up your profile...");
        const profileReady = await ensureProfileWithRetry(3);
        
        if (!profileReady) {
          console.warn('[AuthCallback] Profile setup incomplete, navigating anyway');
        }

        if (cancelled) return;

        setStatus("Success! Redirecting...");
        
        // Small delay to let auth state propagate
        await new Promise(resolve => setTimeout(resolve, 200));

        // Navigate
        navigate(nextPath, { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[AuthCallback] Error:', e);
        setError(getUserFriendlyError(e));
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [navigate, nextPath]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">
          {error ? "Sign in failed" : status}
        </h1>
        
        {!error && (
          <p className="text-sm text-muted-foreground mt-1">
            Just a moment...
          </p>
        )}

        {error ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <div className="space-y-2">
              <Button 
                onClick={() => navigate("/?mode=login", { replace: true })} 
                className="w-full"
              >
                Back to login
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  // Clear any stale auth state and retry
                  supabase.auth.signOut().then(() => {
                    localStorage.clear();
                    window.location.href = "/?mode=login";
                  });
                }}
                className="w-full"
              >
                Reset & try again
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full w-1/2 bg-primary animate-pulse" />
          </div>
        )}
      </section>
    </main>
  );
}
