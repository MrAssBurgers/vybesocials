import { useState } from 'react';
import { useMyAdCampaigns, useAdCampaignStats, useCreateAdCampaign, useUpdateCampaignStatus, AdCampaign } from '@/hooks/useAdCampaigns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Plus, BarChart3, DollarSign, Eye, MousePointerClick, TrendingUp, Pause, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-yellow-500/20 text-yellow-400',
  active: 'bg-green-500/20 text-green-400',
  paused: 'bg-orange-500/20 text-orange-400',
  completed: 'bg-blue-500/20 text-blue-400',
  rejected: 'bg-destructive/20 text-destructive',
};

export default function AdvertiserDashboard() {
  const navigate = useNavigate();
  const { data: campaigns, isLoading } = useMyAdCampaigns();
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const { data: stats } = useAdCampaignStats(selectedCampaign);
  const updateStatus = useUpdateCampaignStatus();
  const [createOpen, setCreateOpen] = useState(false);

  const totals = campaigns?.reduce((acc, c) => ({
    spent: acc.spent + Number(c.spent),
    impressions: acc.impressions + c.impressions,
    clicks: acc.clicks + c.clicks,
  }), { spent: 0, impressions: 0, clicks: 0 }) || { spent: 0, impressions: 0, clicks: 0 };

  const overallCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100) : 0;

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Ad Manager</h1>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full gap-1.5">
                <Plus className="h-4 w-4" /> New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Campaign</DialogTitle>
              </DialogHeader>
              <CreateCampaignForm onSuccess={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard icon={DollarSign} label="Total Spent" value={`$${totals.spent.toFixed(2)}`} />
          <MetricCard icon={Eye} label="Impressions" value={totals.impressions.toLocaleString()} />
          <MetricCard icon={MousePointerClick} label="Clicks" value={totals.clicks.toLocaleString()} />
          <MetricCard icon={TrendingUp} label="Avg CTR" value={`${overallCtr.toFixed(2)}%`} />
        </div>

        <Tabs defaultValue="campaigns">
          <TabsList className="w-full">
            <TabsTrigger value="campaigns" className="flex-1">Campaigns</TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-3 mt-3">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading campaigns...</div>
            ) : !campaigns?.length ? (
              <Card className="rounded-2xl border-dashed">
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No campaigns yet</p>
                  <Button className="mt-4 rounded-full" onClick={() => setCreateOpen(true)}>
                    Create Your First Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : campaigns.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                isSelected={selectedCampaign === c.id}
                onSelect={() => setSelectedCampaign(selectedCampaign === c.id ? null : c.id)}
                onToggle={() => {
                  const next = c.status === 'active' ? 'paused' : c.status === 'paused' ? 'active' : null;
                  if (next) updateStatus.mutate({ id: c.id, status: next });
                }}
              />
            ))}
          </TabsContent>

          <TabsContent value="analytics" className="mt-3">
            {!selectedCampaign ? (
              <Card className="rounded-2xl">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Select a campaign to view detailed analytics
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <Card className="rounded-2xl">
                  <CardHeader><CardTitle className="text-base">Daily Performance (30d)</CardTitle></CardHeader>
                  <CardContent>
                    {stats?.length ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={stats}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                          <XAxis dataKey="stat_date" tick={{ fontSize: 10 }} tickFormatter={(d) => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="impressions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Impressions" />
                          <Bar dataKey="clicks" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Clicks" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">No data yet</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl">
                  <CardHeader><CardTitle className="text-base">Spend Over Time</CardTitle></CardHeader>
                  <CardContent>
                    {stats?.length ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={stats}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                          <XAxis dataKey="stat_date" tick={{ fontSize: 10 }} tickFormatter={(d) => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                          <Bar dataKey="spent" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name="Spent" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">No data yet</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
        </div>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function CampaignCard({ campaign: c, isSelected, onSelect, onToggle }: {
  campaign: AdCampaign; isSelected: boolean; onSelect: () => void; onToggle: () => void;
}) {
  const cpm = c.impressions > 0 ? (c.spent / (c.impressions / 1000)).toFixed(2) : '0.00';
  return (
    <Card className={`rounded-2xl cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`} onClick={onSelect}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-semibold">{c.name}</h3>
            <p className="text-sm text-muted-foreground">{c.headline}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-[10px] ${statusColors[c.status] || ''}`}>{c.status.replace('_', ' ')}</Badge>
            {(c.status === 'active' || c.status === 'paused') && (
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                {c.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
          <div><span className="block text-foreground font-medium">${Number(c.spent).toFixed(2)}</span>Spent</div>
          <div><span className="block text-foreground font-medium">{c.impressions.toLocaleString()}</span>Views</div>
          <div><span className="block text-foreground font-medium">{c.clicks}</span>Clicks</div>
          <div><span className="block text-foreground font-medium">${cpm}</span>eCPM</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateCampaignForm({ onSuccess }: { onSuccess: () => void }) {
  const create = useCreateAdCampaign();
  const [form, setForm] = useState({
    name: '', headline: '', body_text: '', cta_text: 'Learn More', cta_url: '',
    placement: 'feed_inline', daily_budget: '10', bid_amount_cpm: '2', media_url: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      name: form.name,
      headline: form.headline,
      body_text: form.body_text || undefined,
      cta_text: form.cta_text || undefined,
      cta_url: form.cta_url || undefined,
      placement: form.placement,
      daily_budget: parseFloat(form.daily_budget),
      bid_amount_cpm: parseFloat(form.bid_amount_cpm),
      media_url: form.media_url || undefined,
    }, { onSuccess });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><Label>Campaign Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
      <div><Label>Headline</Label><Input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} required /></div>
      <div><Label>Body Text</Label><Textarea value={form.body_text} onChange={e => setForm(f => ({ ...f, body_text: e.target.value }))} rows={2} /></div>
      <div><Label>Media URL</Label><Input value={form.media_url} onChange={e => setForm(f => ({ ...f, media_url: e.target.value }))} placeholder="https://..." /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>CTA Text</Label><Input value={form.cta_text} onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))} /></div>
        <div><Label>CTA Link</Label><Input value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))} placeholder="https://..." /></div>
      </div>
      <div>
        <Label>Placement</Label>
        <Select value={form.placement} onValueChange={v => setForm(f => ({ ...f, placement: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="feed_inline">In-Feed</SelectItem>
            <SelectItem value="story">Story</SelectItem>
            <SelectItem value="boosted_post">Boosted Post</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Daily Budget ($)</Label><Input type="number" min="1" step="0.01" value={form.daily_budget} onChange={e => setForm(f => ({ ...f, daily_budget: e.target.value }))} required /></div>
        <div><Label>CPM Bid ($)</Label><Input type="number" min="0.10" step="0.01" value={form.bid_amount_cpm} onChange={e => setForm(f => ({ ...f, bid_amount_cpm: e.target.value }))} required /></div>
      </div>
      <Button type="submit" className="w-full rounded-full" disabled={create.isPending}>
        {create.isPending ? 'Submitting...' : 'Submit for Review'}
      </Button>
    </form>
  );
}
