import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getUserFriendlyError } from "@/lib/errorUtils";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  // INSTANT callback - never hang more than 4 seconds
  const MAX_CALLBACK_WAIT_MS = 4000;

  const nextPath = useMemo(() => {
    const next = searchParams.get("next") || "/home";
    // Only allow internal navigations
    return next.startsWith("/") ? next : "/home";
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      // If we're still here, proceed into the app IMMEDIATELY
      console.warn('[AuthCallback] Timeout, navigating to app');
      navigate(nextPath, { replace: true });
    }, MAX_CALLBACK_WAIT_MS);

    (async () => {
      try {
        const url = new URL(window.location.href);

        const errorDesc = url.searchParams.get("error_description");
        const errorCode = url.searchParams.get("error");
        if (errorDesc || errorCode) {
          throw new Error(decodeURIComponent(errorDesc || errorCode || "Authentication failed"));
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          );
          if (exchangeError) throw exchangeError;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          throw new Error("No session was created");
        }

        // Fire-and-forget profile ensure - DON'T wait for it
        void (async () => {
          try {
            await supabase.rpc("ensure_profile");
          } catch (err) {
            console.warn('[AuthCallback] Profile ensure failed (non-blocking):', err);
          }
        })();

        if (cancelled) return;

        // Navigate to app IMMEDIATELY - profile/data loads in background
        console.log('[AuthCallback] Session ready, navigating immediately');
        navigate(nextPath, { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        setError(getUserFriendlyError(e));
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [navigate, nextPath]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Signing you in…</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Just a moment...
        </p>

        {error ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={() => navigate("/?mode=login", { replace: true })} className="w-full">
              Back to login
            </Button>
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
