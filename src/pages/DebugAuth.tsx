import { useState, useEffect } from "react";
import { supabase, storageStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const AUTH_STORAGE_KEY = 'vybe-auth-token';

interface TestResult {
  name: string;
  status: "pending" | "pass" | "fail";
  data?: any;
  error?: string;
}

export default function DebugAuth() {
  const { user, session, authReady, authPhase, profile, refreshProfile } = useAuth();
  const [tests, setTests] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const updateTest = (name: string, update: Partial<TestResult>) => {
    setTests(prev => prev.map(t => t.name === name ? { ...t, ...update } : t));
  };

  const runDiagnostics = async () => {
    setRunning(true);
    setTests([
      { name: "getSession()", status: "pending" },
      { name: "current_profile_id RPC", status: "pending" },
      { name: "Direct profiles SELECT", status: "pending" },
      { name: "Fetch with explicit header", status: "pending" },
    ]);

    // Test 1: getSession
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        updateTest("getSession()", { status: "fail", error: error.message });
      } else if (!data.session) {
        updateTest("getSession()", { status: "fail", error: "No session returned" });
      } else {
        updateTest("getSession()", { 
          status: "pass", 
          data: {
            hasToken: !!data.session.access_token,
            tokenLength: data.session.access_token?.length,
            expiresAt: data.session.expires_at,
            userId: data.session.user?.id,
          }
        });
      }
    } catch (e: any) {
      updateTest("getSession()", { status: "fail", error: e.message });
    }

    // Test 2: current_profile_id RPC
    try {
      const { data, error } = await supabase.rpc("current_profile_id");
      if (error) {
        updateTest("current_profile_id RPC", { status: "fail", error: `${error.code}: ${error.message}` });
      } else if (!data) {
        updateTest("current_profile_id RPC", { status: "fail", error: "Returned null (no profile found for auth user)" });
      } else {
        updateTest("current_profile_id RPC", { status: "pass", data: { profileId: data } });
      }
    } catch (e: any) {
      updateTest("current_profile_id RPC", { status: "fail", error: e.message });
    }

    // Test 3: Direct profiles SELECT
    const authUserId = user?.id;
    if (!authUserId) {
      updateTest("Direct profiles SELECT", { status: "fail", error: "No user.id available to query" });
    } else {
      try {
        const { data, error, status } = await supabase
          .from("profiles")
          .select("id, user_id, username, display_name")
          .eq("user_id", authUserId)
          .maybeSingle();
        
        if (error) {
          updateTest("Direct profiles SELECT", { status: "fail", error: `HTTP ${status}: ${error.code} - ${error.message}` });
        } else if (!data) {
          updateTest("Direct profiles SELECT", { status: "fail", error: `No profile row exists for user_id=${authUserId}` });
        } else {
          updateTest("Direct profiles SELECT", { status: "pass", data });
        }
      } catch (e: any) {
        updateTest("Direct profiles SELECT", { status: "fail", error: e.message });
      }
    }

    // Test 4: Manual fetch with explicit Authorization header
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      if (!token) {
        updateTest("Fetch with explicit header", { status: "fail", error: "No access token to use" });
      } else {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?select=id,username&user_id=eq.${authUserId}&limit=1`,
          {
            headers: {
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              "Authorization": `Bearer ${token}`,
            },
          }
        );
        const body = await res.json();
        if (!res.ok) {
          updateTest("Fetch with explicit header", { status: "fail", error: `HTTP ${res.status}: ${JSON.stringify(body)}` });
        } else if (!body.length) {
          updateTest("Fetch with explicit header", { status: "fail", error: "0 rows returned" });
        } else {
          updateTest("Fetch with explicit header", { status: "pass", data: body[0] });
        }
      }
    } catch (e: any) {
      updateTest("Fetch with explicit header", { status: "fail", error: e.message });
    }

    setRunning(false);
  };

  useEffect(() => {
    if (authReady) {
      runDiagnostics();
    }
  }, [authReady]);

  const copyDebugInfo = () => {
    const info = {
      timestamp: new Date().toISOString(),
      origin: window.location.origin,
      pathname: window.location.pathname,
      authPhase,
      authReady,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      tokenExpiry: session?.expires_at ?? null,
      profileId: profile?.id ?? null,
      profileUsername: profile?.username ?? null,
      tests: tests.map(t => ({ name: t.name, status: t.status, error: t.error, data: t.data })),
    };
    navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    toast.success("Debug info copied!");
  };

  const forceEnsureProfile = async () => {
    try {
      toast.info("Running ensure_profile...");
      const { error } = await supabase.rpc("ensure_profile");
      if (error) {
        toast.error(`ensure_profile failed: ${error.message}`);
      } else {
        toast.success("ensure_profile succeeded, re-running tests...");
        await refreshProfile();
        runDiagnostics();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const hardResetAuth = async () => {
    try {
      await supabase.auth.signOut();
      // Clear the CORRECT storage key
      localStorage.removeItem(AUTH_STORAGE_KEY);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      sessionStorage.clear();
      localStorage.clear();
      toast.success("Signed out and cleared all storage. Reloading...");
      setTimeout(() => window.location.href = "/", 1000);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Storage diagnostics
  const storageDiagnostics = {
    localStorageAvailable: storageStatus.localStorageAvailable,
    usingFallback: storageStatus.usingFallback,
    authTokenPresent: (() => {
      try {
        const storage = storageStatus.localStorageAvailable ? localStorage : sessionStorage;
        return !!storage.getItem(AUTH_STORAGE_KEY);
      } catch { return false; }
    })(),
    authTokenLength: (() => {
      try {
        const storage = storageStatus.localStorageAvailable ? localStorage : sessionStorage;
        return storage.getItem(AUTH_STORAGE_KEY)?.length ?? 0;
      } catch { return 0; }
    })(),
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Auth Diagnostics
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyDebugInfo}>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={runDiagnostics} disabled={running}>
                <RefreshCw className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} /> Re-run
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm font-mono">
          <div><strong>Origin:</strong> {window.location.origin}</div>
          <div><strong>Auth Phase:</strong> {authPhase}</div>
          <div><strong>Auth Ready:</strong> {authReady ? "✅ Yes" : "❌ No"}</div>
          <div><strong>User ID:</strong> {user?.id ?? "null"}</div>
          <div><strong>User Email:</strong> {user?.email ?? "null"}</div>
          <div><strong>Has Session:</strong> {session ? "✅ Yes" : "❌ No"}</div>
          <div><strong>Has Access Token:</strong> {session?.access_token ? `✅ Yes (${session.access_token.length} chars)` : "❌ No"}</div>
          <div><strong>Token Expires:</strong> {session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : "N/A"}</div>
          <div><strong>Profile ID (context):</strong> {profile?.id ?? "null"}</div>
          <div><strong>Profile Username:</strong> {profile?.username ?? "null"}</div>
          <div className="border-t pt-2 mt-2">
            <div><strong>localStorage Available:</strong> {storageDiagnostics.localStorageAvailable ? "✅ Yes" : "❌ No (using sessionStorage)"}</div>
            <div><strong>Auth Token Present:</strong> {storageDiagnostics.authTokenPresent ? `✅ Yes (${storageDiagnostics.authTokenLength} chars)` : "❌ No"}</div>
            <div><strong>Storage Key:</strong> {AUTH_STORAGE_KEY}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Tests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tests.map((test) => (
            <div key={test.name} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                {test.status === "pending" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {test.status === "pass" && <CheckCircle className="h-4 w-4 text-green-500" />}
                {test.status === "fail" && <XCircle className="h-4 w-4 text-red-500" />}
                {test.name}
              </div>
              {test.error && (
                <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded font-mono break-all">
                  {test.error}
                </div>
              )}
              {test.data && (
                <div className="text-xs text-green-600 bg-green-500/10 p-2 rounded font-mono break-all">
                  {JSON.stringify(test.data)}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={forceEnsureProfile}>
            Force ensure_profile
          </Button>
          <Button variant="destructive" onClick={hardResetAuth}>
            Hard Reset Auth (Sign Out + Clear Storage)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
