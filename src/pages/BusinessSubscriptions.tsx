import { useState } from 'react';
import { useBusinessTiers, useMyBusinessSubscription, useSubscribeBusiness, BusinessTier } from '@/hooks/useBusinessSubscriptions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, Crown, Sparkles, BarChart3, Rocket, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

const tierIcons: Record<number, any> = {
  0: BarChart3,
  1: Rocket,
  2: Crown,
  3: Sparkles,
};

export default function BusinessSubscriptions() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: tiers, isLoading: tiersLoading } = useBusinessTiers();
  const subscribe = useSubscribeBusiness();

  // Get user's business
  const { data: business } = useQuery({
    queryKey: ['my-business-for-sub', profile?.id],
    queryFn: async () => {
      const { data } = await db
        .from('business_profiles')
        .select('id, name')
        .eq('owner_id', profile!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.id,
  });

  const { data: currentSub } = useMyBusinessSubscription(business?.id || null);

  const handleSubscribe = (tier: BusinessTier) => {
    if (!business) return;
    // If tier has a RevenueCat product, we'd trigger RC purchase flow here
    // For now, activate directly (admin-managed billing)
    subscribe.mutate({ businessId: business.id, tierId: tier.id });
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Business Plans</h1>
            {business && <p className="text-xs text-muted-foreground">{business.name}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-4">
        {!business ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center">
              <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">Create a business profile first to access business plans.</p>
              <Button onClick={() => navigate('/business')} className="rounded-full">Go to Business Portal</Button>
            </CardContent>
          </Card>
        ) : tiersLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading plans...</div>
        ) : !tiers?.length ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No business plans available yet. Check back soon!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier, i) => {
              const Icon = tierIcons[i] || Sparkles;
              const isCurrentTier = currentSub?.tier_id === tier.id && currentSub?.status === 'active';
              return (
                <Card
                  key={tier.id}
                  className={`rounded-2xl relative overflow-hidden transition-all ${
                    isCurrentTier ? 'ring-2 ring-primary' : 'hover:shadow-lg'
                  }`}
                >
                  {isCurrentTier && (
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-primary text-primary-foreground text-[10px]">Current Plan</Badge>
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{tier.name}</CardTitle>
                    </div>
                    {tier.description && (
                      <p className="text-sm text-muted-foreground">{tier.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <span className="text-3xl font-bold">${Number(tier.price_monthly).toFixed(2)}</span>
                      <span className="text-muted-foreground text-sm">/mo</span>
                    </div>

                    <ul className="space-y-2">
                      {(tier.features as string[]).map((f, fi) => (
                        <li key={fi} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                      {tier.analytics_level !== 'basic' && (
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{tier.analytics_level === 'full' ? 'Full' : 'Advanced'} Analytics</span>
                        </li>
                      )}
                      {tier.promo_tools_enabled && (
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>Promotional Tools</span>
                        </li>
                      )}
                      {tier.priority_support && (
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>Priority Support</span>
                        </li>
                      )}
                      {Number(tier.visibility_boost_multiplier) > 1 && (
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{tier.visibility_boost_multiplier}x Visibility Boost</span>
                        </li>
                      )}
                    </ul>

                    <Button
                      className="w-full rounded-full"
                      variant={isCurrentTier ? 'outline' : 'default'}
                      disabled={isCurrentTier || subscribe.isPending}
                      onClick={() => handleSubscribe(tier)}
                    >
                      {isCurrentTier ? 'Current Plan' : subscribe.isPending ? 'Subscribing...' : 'Subscribe'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {currentSub && (
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current Plan</p>
                  <p className="font-semibold">{currentSub.tier?.name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    Active since {new Date(currentSub.started_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={currentSub.status === 'active' ? 'default' : 'secondary'}>
                  {currentSub.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
