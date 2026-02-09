import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  CreditCard, CheckCircle2, AlertCircle, ExternalLink, 
  Loader2, RefreshCw, DollarSign, Shield, Zap
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StripeStatus {
  connected: boolean;
  onboarding_complete: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  account_id?: string;
}

interface PaymentsSetupProps {
  businessId: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
}

export function PaymentsSetup({ 
  businessId, 
  stripeAccountId, 
  stripeOnboardingComplete 
}: PaymentsSetupProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<StripeStatus>({
    connected: !!stripeAccountId,
    onboarding_complete: stripeOnboardingComplete,
  });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  // Check for Stripe return params
  useEffect(() => {
    const stripeSuccess = searchParams.get('stripe_success');
    const stripeRefresh = searchParams.get('stripe_refresh');

    if (stripeSuccess === 'true') {
      toast.success('Stripe setup completed! Verifying your account...');
      checkStripeStatus();
      // Clear URL params
      searchParams.delete('stripe_success');
      setSearchParams(searchParams);
    }

    if (stripeRefresh === 'true') {
      toast.info('Please complete your Stripe setup to start accepting payments');
      searchParams.delete('stripe_refresh');
      setSearchParams(searchParams);
    }
  }, [searchParams]);

  // Check status on mount if we have an account
  useEffect(() => {
    if (stripeAccountId) {
      checkStripeStatus();
    }
  }, [stripeAccountId]);

  const checkStripeStatus = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-stripe-connect');
      if (error) throw error;
      setStatus(data);
    } catch (err) {
      console.error('Failed to check Stripe status:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleConnectStripe = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect');

      if (error) {
        const msg = (error as any)?.message ? String((error as any).message) : '';

        if (msg.includes('signed up for Connect') || msg.includes('sign up for Connect')) {
          toast.error(
            "Payments setup isn't enabled yet. Enable Stripe Connect in your Stripe settings, then try again.",
          );
        } else {
          toast.error(msg || 'Failed to start Stripe setup');
        }
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error('Stripe did not return an onboarding link. Please try again.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start Stripe setup');
    } finally {
      setLoading(false);
    }
  };


  const handleOpenDashboard = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-dashboard-link');
      if (error) throw error;
      
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to open Stripe dashboard');
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = () => {
    if (!status.connected) return 0;
    if (!status.details_submitted) return 33;
    if (!status.charges_enabled || !status.payouts_enabled) return 66;
    return 100;
  };

  return (
    <div className="space-y-6">
      {/* Main Payment Setup Card */}
      <Card className="liquid-glass-card overflow-hidden">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Payment Setup
              </CardTitle>
              <CardDescription>
                Connect Stripe to accept payments and receive payouts
              </CardDescription>
            </div>
            {status.onboarding_complete && (
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="pt-6 space-y-6">
          {/* Progress Indicator */}
          {status.connected && !status.onboarding_complete && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Setup Progress</span>
                <span className="font-medium">{getProgressPercentage()}%</span>
              </div>
              <Progress value={getProgressPercentage()} className="h-2" />
            </div>
          )}

          {/* Status Grid */}
          {status.connected && (
            <div className="grid grid-cols-3 gap-4">
              <div className={`p-4 rounded-lg text-center ${status.details_submitted ? 'bg-green-500/10' : 'bg-muted/50'}`}>
                <div className={`w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center ${status.details_submitted ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                  {status.details_submitted ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-sm">1</span>}
                </div>
                <p className="text-xs font-medium">Details Submitted</p>
              </div>
              
              <div className={`p-4 rounded-lg text-center ${status.charges_enabled ? 'bg-green-500/10' : 'bg-muted/50'}`}>
                <div className={`w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center ${status.charges_enabled ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                  {status.charges_enabled ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-sm">2</span>}
                </div>
                <p className="text-xs font-medium">Charges Enabled</p>
              </div>
              
              <div className={`p-4 rounded-lg text-center ${status.payouts_enabled ? 'bg-green-500/10' : 'bg-muted/50'}`}>
                <div className={`w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center ${status.payouts_enabled ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                  {status.payouts_enabled ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-sm">3</span>}
                </div>
                <p className="text-xs font-medium">Payouts Enabled</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {!status.connected ? (
              <Button 
                onClick={handleConnectStripe} 
                disabled={loading}
                className="gap-2 gradient-animated flex-1"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Connect Stripe Account
              </Button>
            ) : !status.onboarding_complete ? (
              <>
                <Button 
                  onClick={handleConnectStripe} 
                  disabled={loading}
                  className="gap-2 gradient-animated flex-1"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Complete Setup
                </Button>
                <Button 
                  variant="outline" 
                  onClick={checkStripeStatus}
                  disabled={checking}
                  className="gap-2"
                >
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh Status
                </Button>
              </>
            ) : (
              <>
                <Button 
                  onClick={handleOpenDashboard} 
                  disabled={loading}
                  className="gap-2 flex-1"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Open Stripe Dashboard
                </Button>
                <Button 
                  variant="outline" 
                  onClick={checkStripeStatus}
                  disabled={checking}
                  className="gap-2"
                >
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </>
            )}
          </div>

          {/* Info Message */}
          {!status.connected && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-500">Why connect Stripe?</p>
                <p className="text-muted-foreground">
                  Stripe handles all payment processing securely. You'll receive payouts directly 
                  to your bank account with no platform fees on transactions.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="liquid-glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold">Instant Payouts</h3>
                <p className="text-xs text-muted-foreground">Get paid within 2 days</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="liquid-glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold">Secure Payments</h3>
                <p className="text-xs text-muted-foreground">PCI-compliant security</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="liquid-glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Zap className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h3 className="font-semibold">All Payment Methods</h3>
                <p className="text-xs text-muted-foreground">Cards, wallets & more</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
