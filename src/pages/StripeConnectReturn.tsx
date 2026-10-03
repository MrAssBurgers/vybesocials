import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ConnectStatus = {
  connected?: boolean;
  onboarding_complete?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  error?: string;
};

export default function StripeConnectReturn() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const refreshStatus = async () => {
      try {
        const { data, error } = await db.functions.invoke('check-stripe-connect');
        if (cancelled) return;
        if (error) throw error;
        setStatus((data || {}) as ConnectStatus);
      } catch {
        if (!cancelled) {
          setStatus({ error: 'Unable to verify Stripe setup right now.' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void refreshStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const complete =
    !!status?.onboarding_complete ||
    (!!status?.details_submitted &&
      !!status?.charges_enabled &&
      !!status?.payouts_enabled);

  return (
    <div className="min-h-screen bg-background px-4 py-10 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Stripe setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying your Stripe account…
            </div>
          ) : complete ? (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-green-600">Payout setup complete</p>
                  <p className="text-muted-foreground mt-1">
                    Your Stripe account is ready. You can return to VYBE to manage payouts.
                  </p>
                </div>
              </div>
              <Button className="w-full" onClick={() => navigate('/creator', { replace: true })}>
                Back to Creator Dashboard
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Setup not finished</p>
                  <p className="text-muted-foreground mt-1">
                    {status?.error ||
                      'Stripe has not confirmed onboarding yet. You can resume setup from your dashboard.'}
                  </p>
                </div>
              </div>
              <Button className="w-full" onClick={() => navigate('/creator', { replace: true })}>
                Resume setup in VYBE
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/stripe-connect/refresh">Get a fresh Stripe link</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
