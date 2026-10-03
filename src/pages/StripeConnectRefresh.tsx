import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { openStripeConnectFlow } from '@/lib/openStripeConnectFlow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StripeConnectRefresh() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resume = async () => {
      try {
        const { data, error: invokeError } = await db.functions.invoke('create-stripe-connect');
        if (cancelled) return;
        if (invokeError) throw invokeError;

        const payload = data as { url?: string; error?: string } | null;
        if (payload?.error) {
          setError(payload.error);
          return;
        }
        if (!payload?.url) {
          setError('Unable to create a fresh Stripe onboarding link.');
          return;
        }

        const opened = await openStripeConnectFlow(payload.url);
        if (!opened) {
          setError('Could not open Stripe. Try again from your creator dashboard.');
          return;
        }
        navigate('/creator', { replace: true });
      } catch {
        if (!cancelled) {
          setError('Failed to refresh Stripe setup. Try again from your dashboard.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void resume();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background px-4 py-10 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Resume Stripe setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating a fresh Stripe onboarding link…
            </div>
          ) : error ? (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button className="w-full" onClick={() => navigate('/creator', { replace: true })}>
                Back to Creator Dashboard
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/stripe-connect/refresh">Try again</Link>
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
