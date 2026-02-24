import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, DollarSign, Eye, Users, BarChart3, Wallet,
  Loader2, Sparkles, ArrowUpRight, ArrowDownRight, Clock,
  Shield, Star, Zap, ChevronRight, BadgeCheck, CreditCard,
  CheckCircle2, AlertCircle, ExternalLink, Heart, MessageCircle, Activity
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/auth';
import {
  useCreatorProfile,
  useApplyForPartner,
  useCreatorEarnings,
  useCreatorDailyStats,
  useCreatorPayouts,
} from '@/hooks/useCreatorProfile';
import {
  useCreatorConnectStatus,
  useCreatorConnectOnboard,
  useProcessCreatorPayout,
} from '@/hooks/useCreatorConnect';
import { useQueryClient } from '@tanstack/react-query';
import { useCreatorContentStats, useFollowerGrowth } from '@/hooks/useCreatorAnalytics';

const TIER_CONFIG = {
  none: { label: 'Not Enrolled', color: 'text-muted-foreground', bg: 'bg-muted', icon: Star },
  emerging: { label: 'Emerging Creator', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: Sparkles },
  verified: { label: 'Verified Creator', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: BadgeCheck },
  elite: { label: 'Elite Partner', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Zap },
};

const TIER_PERKS = {
  emerging: ['Ad revenue sharing (60/40)', 'Basic analytics', 'Creator badge'],
  verified: ['Higher revenue split', 'Subscription monetization', 'Creator badge', 'Advanced analytics'],
  elite: ['Brand deal marketplace', 'Premium visibility boost', 'Beta features', 'Custom cosmetics'],
};

const REVENUE_SPLITS = [
  { source: 'Ads', creator: 60, platform: 40 },
  { source: 'Subscriptions', creator: 80, platform: 20 },
  { source: 'Tips', creator: 85, platform: 15 },
  { source: 'Brand Deals', creator: 75, platform: 25 },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ─── Stripe Connect Setup Card ───
function StripeConnectCard() {
  const { data: connectStatus, isLoading } = useCreatorConnectStatus();
  const { startOnboarding, isLoading: isOnboarding } = useCreatorConnectOnboard();

  if (isLoading) return null;
  if (connectStatus?.stripe_not_configured) return null;
  if (connectStatus?.onboarding_complete) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Set Up Payouts</p>
            <p className="text-xs text-muted-foreground">
              {connectStatus?.connected
                ? 'Complete your account setup to receive payouts'
                : 'Connect your bank account to start earning'}
            </p>
          </div>
        </div>

        {connectStatus?.connected && (
          <div className="flex gap-2 flex-wrap">
            <StatusPill ok={connectStatus.details_submitted} label="Details" />
            <StatusPill ok={connectStatus.charges_enabled} label="Charges" />
            <StatusPill ok={connectStatus.payouts_enabled} label="Payouts" />
          </div>
        )}

        <Button
          size="sm"
          className="w-full rounded-xl"
          onClick={startOnboarding}
          disabled={isOnboarding}
        >
          {isOnboarding ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-2" />
          )}
          {connectStatus?.connected ? 'Continue Setup' : 'Set Up Payouts'}
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusPill({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
      ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
    }`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}
    </div>
  );
}

// ─── Apply Screen ───
function ApplyScreen() {
  const apply = useApplyForPartner();

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center gap-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center"
        >
          <Sparkles className="h-10 w-10 text-primary" />
        </motion.div>

        <h1 className="text-2xl font-bold">VYBE Partner Program</h1>
        <p className="text-muted-foreground max-w-sm leading-relaxed">
          Monetize your content, earn revenue from ads, subscriptions, and tips.
          Grow through three creator tiers with increasing perks.
        </p>

        <div className="w-full max-w-md space-y-3">
          {(['emerging', 'verified', 'elite'] as const).map((tier) => {
            const config = TIER_CONFIG[tier];
            const Icon = config.icon;
            return (
              <Card key={tier} className="border-border/50">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${config.bg}`}>
                    <Icon className={`h-5 w-5 ${config.color}`} />
                  </div>
                  <div className="text-left flex-1">
                    <p className={`font-semibold text-sm ${config.color}`}>{config.label}</p>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {TIER_PERKS[tier].map((p) => (
                        <li key={p}>• {p}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="w-full max-w-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue Sharing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {REVENUE_SPLITS.map((s) => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.source}</span>
                <span className="font-medium text-primary">{s.creator}% / {s.platform}%</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="rounded-2xl px-8"
          onClick={() => apply.mutate()}
          disabled={apply.isPending}
        >
          {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Apply Now
        </Button>
      </div>
    </AppLayout>
  );
}

// ─── Pending Screen ───
function PendingScreen() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <Clock className="h-16 w-16 text-amber-400" />
        <h2 className="text-xl font-bold">Application Under Review</h2>
        <p className="text-muted-foreground max-w-sm">
          We're reviewing your profile. You'll be notified once you're approved!
        </p>
      </div>
    </AppLayout>
  );
}

// ─── Dashboard ───
function CreatorDashboardContent({ creatorProfile }: { creatorProfile: any }) {
  const { data: earnings = [] } = useCreatorEarnings(creatorProfile.id);
  const { data: dailyStats = [] } = useCreatorDailyStats(creatorProfile.id);
  const { data: payouts = [] } = useCreatorPayouts(creatorProfile.id);
  const { data: connectStatus } = useCreatorConnectStatus();
  const { processPayout, isLoading: isPayoutLoading } = useProcessCreatorPayout();
  const qc = useQueryClient();

  const tier = creatorProfile.tier as keyof typeof TIER_CONFIG;
  const config = TIER_CONFIG[tier] || TIER_CONFIG.emerging;
  const TierIcon = config.icon;

  const last30Revenue = dailyStats.reduce((sum: number, d: any) => sum + (d.ad_revenue || 0) + (d.subscription_revenue || 0) + (d.tip_revenue || 0), 0);
  const last30Views = dailyStats.reduce((sum: number, d: any) => sum + (d.views || 0), 0);
  const avgCpm = dailyStats.length > 0
    ? dailyStats.reduce((sum: number, d: any) => sum + (d.cpm || 0), 0) / dailyStats.length
    : 0;
  const avgRpm = dailyStats.length > 0
    ? dailyStats.reduce((sum: number, d: any) => sum + (d.rpm || 0), 0) / dailyStats.length
    : 0;

  const canWithdraw = connectStatus?.onboarding_complete && creatorProfile.pending_payout > 0;

  const handleWithdraw = async () => {
    const success = await processPayout(creatorProfile.pending_payout);
    if (success) {
      qc.invalidateQueries({ queryKey: ['creator-payouts'] });
      qc.invalidateQueries({ queryKey: ['creator-profile'] });
    }
  };

  return (
    <AppLayout>
      <div className="p-4 pb-24 space-y-5 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Creator Dashboard</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={`${config.bg} ${config.color} border-0`}>
                <TierIcon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
              {connectStatus?.onboarding_complete && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Payouts Active
                </Badge>
              )}
            </div>
          </div>
          {canWithdraw && (
            <Button
              size="sm"
              className="rounded-xl"
              onClick={handleWithdraw}
              disabled={isPayoutLoading}
            >
              {isPayoutLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Wallet className="h-4 w-4 mr-1" />
              )}
              Withdraw
            </Button>
          )}
        </div>

        {/* Stripe Connect Setup (shows only if not complete) */}
        <StripeConnectCard />

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Total Earnings" value={formatCurrency(creatorProfile.total_earnings || 0)} icon={DollarSign} trend="up" />
          <MetricCard label="Pending Payout" value={formatCurrency(creatorProfile.pending_payout || 0)} icon={Wallet} trend="neutral" />
          <MetricCard label="30d Views" value={last30Views.toLocaleString()} icon={Eye} trend="up" />
          <MetricCard label="Subscribers" value={(creatorProfile.subscriber_count || 0).toLocaleString()} icon={Users} trend="up" />
        </div>

        {/* CPM / RPM */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Avg CPM</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(avgCpm)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Avg RPM</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(avgRpm)}</p>
            </CardContent>
          </Card>
        </div>

        {/* 30d Revenue */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              30-Day Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(last30Revenue)}</p>
            {dailyStats.length > 0 ? (
              <div className="mt-3 flex gap-0.5 items-end h-16">
                {[...dailyStats].reverse().map((d: any, i: number) => {
                  const total = (d.ad_revenue || 0) + (d.subscription_revenue || 0) + (d.tip_revenue || 0);
                  const maxRev = Math.max(...dailyStats.map((s: any) => (s.ad_revenue || 0) + (s.subscription_revenue || 0) + (s.tip_revenue || 0)), 1);
                  const height = Math.max((total / maxRev) * 100, 4);
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-primary/60 rounded-t-sm min-w-[3px]"
                      style={{ height: `${height}%` }}
                      title={`${d.stat_date}: ${formatCurrency(total)}`}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">No data yet — earnings will appear here as you grow.</p>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="analytics">
          <TabsList className="w-full">
            <TabsTrigger value="analytics" className="flex-1">Analytics</TabsTrigger>
            <TabsTrigger value="earnings" className="flex-1">Earnings</TabsTrigger>
            <TabsTrigger value="payouts" className="flex-1">Payouts</TabsTrigger>
            <TabsTrigger value="splits" className="flex-1">Splits</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-3 space-y-4">
            <CreatorAnalyticsTab />
          </TabsContent>

          <TabsContent value="earnings" className="mt-3 space-y-2">
            {earnings.length === 0 ? (
              <EmptyState
                icon={<DollarSign className="h-8 w-8 text-muted-foreground" />}
                title="No earnings yet"
                description="Revenue from ads, subscriptions, and tips will appear here."
              />
            ) : (
              earnings.map((e: any) => (
                <Card key={e.id} className="border-border/50">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium capitalize">{e.source.replace('_', ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString()}
                        {' · '}
                        <span className={
                          e.status === 'paid' ? 'text-emerald-400' :
                          e.status === 'pending' ? 'text-amber-400' : 'text-muted-foreground'
                        }>
                          {e.status}
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{formatCurrency(e.creator_amount)}</p>
                      <p className="text-[10px] text-muted-foreground">{e.platform_fee_pct}% fee</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="payouts" className="mt-3 space-y-2">
            {payouts.length === 0 ? (
              <EmptyState
                icon={<Wallet className="h-8 w-8 text-muted-foreground" />}
                title="No payouts yet"
                description="Request a withdrawal when your pending balance is available."
              />
            ) : (
              payouts.map((p: any) => (
                <Card key={p.id} className="border-border/50">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.requested_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className={
                      p.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-0' :
                      p.status === 'processing' ? 'bg-blue-500/10 text-blue-400 border-0' :
                      p.status === 'failed' ? 'bg-destructive/10 text-destructive border-0' :
                      'bg-amber-500/10 text-amber-400 border-0'
                    }>
                      {p.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="splits" className="mt-3">
            <Card className="border-border/50">
              <CardContent className="p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Your share of every dollar earned on VYBE:
                </p>
                {REVENUE_SPLITS.map((s) => (
                  <div key={s.source} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{s.source}</span>
                      <span className="font-bold text-primary">{s.creator}%</span>
                    </div>
                    <Progress value={s.creator} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function MetricCard({ label, value, icon: Icon, trend }: {
  label: string;
  value: string;
  icon: any;
  trend: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {trend === 'up' && <ArrowUpRight className="h-3 w-3 text-emerald-400" />}
          {trend === 'down' && <ArrowDownRight className="h-3 w-3 text-destructive" />}
        </div>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Analytics Tab ───
function CreatorAnalyticsTab() {
  const { data: contentStats, isLoading: statsLoading } = useCreatorContentStats();
  const { data: followerData, isLoading: followersLoading } = useFollowerGrowth();

  if (statsLoading || followersLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Engagement overview */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Heart className="h-4 w-4 text-rose-400" />
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
            </div>
            <p className="text-lg font-bold">{(contentStats?.totalLikes || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Likes</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <MessageCircle className="h-4 w-4 text-blue-400" />
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
            </div>
            <p className="text-lg font-bold">{(contentStats?.totalComments || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Comments</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-4 w-4 text-primary" />
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
            </div>
            <p className="text-lg font-bold">{(followerData?.total || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Followers</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-lg font-bold">{(contentStats?.engagementRate || 0).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Engagement Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Follower growth spark line */}
      {followerData && followerData.recentFollowers.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              30-Day Follower Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">+{followerData.recentFollowers.length}</p>
            <p className="text-xs text-muted-foreground">new followers this month</p>
            <div className="mt-3 flex gap-0.5 items-end h-12">
              {Array.from({ length: 30 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - 29 + i);
                const dateStr = date.toISOString().split('T')[0];
                const count = followerData.recentFollowers.filter(
                  (f: any) => f.created_at.startsWith(dateStr)
                ).length;
                const maxCount = Math.max(
                  ...Array.from({ length: 30 }, (_, j) => {
                    const d = new Date();
                    d.setDate(d.getDate() - 29 + j);
                    return followerData.recentFollowers.filter(
                      (f: any) => f.created_at.startsWith(d.toISOString().split('T')[0])
                    ).length;
                  }),
                  1
                );
                const height = Math.max((count / maxCount) * 100, 4);
                return (
                  <div
                    key={i}
                    className="flex-1 bg-primary/60 rounded-t-sm min-w-[3px]"
                    style={{ height: `${height}%` }}
                    title={`${dateStr}: +${count}`}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top performing posts */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Top Performing Content
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(!contentStats?.topPosts || contentStats.topPosts.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Post content to see performance metrics here.
            </p>
          ) : (
            contentStats.topPosts.map((post: any, i: number) => (
              <div key={post.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {post.caption || 'Untitled post'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {post.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" /> {post.comments}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {(post.view_count || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] border-0 bg-muted">
                  {post.type}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Entry ───
export default function CreatorDashboard() {
  const { profile } = useAuth();
  const { data: creatorProfile, isLoading } = useCreatorProfile();

  if (!profile) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <EmptyState
            icon={<Shield className="h-12 w-12 text-muted-foreground" />}
            title="Sign in required"
            description="Please sign in to access the Creator Dashboard"
          />
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!creatorProfile) return <ApplyScreen />;
  if (creatorProfile.applied_at && !creatorProfile.is_approved) return <PendingScreen />;
  return <CreatorDashboardContent creatorProfile={creatorProfile} />;
}
