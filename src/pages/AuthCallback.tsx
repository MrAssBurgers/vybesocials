import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getUserFriendlyError } from "@/lib/errorUtils";
import { Button } from "@/components/ui/button";

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

    // Hard timeout - NEVER hang more than 6 seconds
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      console.warn('[AuthCallback] Timeout exceeded, navigating anyway');
      navigate(nextPath, { replace: true });
    }, 6000);

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

        setStatus("Success! Redirecting...");

        // Fire-and-forget profile ensure
        void (async () => {
          try {
            await supabase.rpc("ensure_profile");
          } catch (err) {
            console.warn('[AuthCallback] ensure_profile failed (non-blocking):', err);
          }
        })();

        if (cancelled) return;

        // Navigate immediately
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
