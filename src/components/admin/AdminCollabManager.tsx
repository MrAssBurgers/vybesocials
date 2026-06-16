import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Handshake, Plus, Edit2, Trash2, Search, Building2, 
  CheckCircle, XCircle, Eye, ExternalLink, Users
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/lib/auth';

interface SponsorFormData {
  company_name: string;
  company_logo: string;
  description: string;
  website_url: string;
  contact_email: string;
  is_verified: boolean;
}

const defaultSponsorForm: SponsorFormData = {
  company_name: '',
  company_logo: '',
  description: '',
  website_url: '',
  contact_email: '',
  is_verified: false,
};

export function AdminCollabManager() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('sponsors');
  const [editingSponsor, setEditingSponsor] = useState<any | null>(null);
  const [sponsorForm, setSponsorForm] = useState<SponsorFormData>(defaultSponsorForm);
  const [isSponsorDialogOpen, setIsSponsorDialogOpen] = useState(false);

  // Fetch all sponsors
  const { data: sponsors = [], isLoading: sponsorsLoading } = useQuery({
    queryKey: ['admin-sponsors'],
    queryFn: async () => {
      const { data, error } = await db
        .from('sponsor_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all collab posts
  const { data: collabPosts = [], isLoading: collabsLoading } = useQuery({
    queryKey: ['admin-collab-posts'],
    queryFn: async () => {
      const { data, error } = await db
        .from('collab_posts')
        .select(`
          *,
          post:posts(id, caption, media_url, created_at, author:profiles!author_id(username, avatar_url)),
          collaborator:profiles!collaborator_id(id, username, avatar_url, display_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch sponsor analytics
  const { data: sponsorAnalytics = {} } = useQuery({
    queryKey: ['sponsor-analytics'],
    queryFn: async () => {
      const { data, error } = await db
        .from('sponsor_analytics')
        .select('sponsor_id, event_type')
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      
      // Aggregate by sponsor
      const aggregated: Record<string, { views: number; clicks: number; rsvps: number }> = {};
      data?.forEach((event) => {
        if (!aggregated[event.sponsor_id]) {
          aggregated[event.sponsor_id] = { views: 0, clicks: 0, rsvps: 0 };
        }
        if (event.event_type === 'view') aggregated[event.sponsor_id].views++;
        if (event.event_type === 'click') aggregated[event.sponsor_id].clicks++;
        if (event.event_type === 'rsvp') aggregated[event.sponsor_id].rsvps++;
      });
      
      return aggregated;
    },
  });

  // Create sponsor mutation
  const createSponsor = useMutation({
    mutationFn: async (data: SponsorFormData) => {
      if (!profile?.id) throw new Error('Not authenticated');
      
      const { error } = await db.from('sponsor_profiles').insert({
        company_name: data.company_name,
        company_logo: data.company_logo || null,
        description: data.description || null,
        website_url: data.website_url || null,
        contact_email: data.contact_email || null,
        is_verified: data.is_verified,
        user_id: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sponsors'] });
      toast.success('Sponsor created!');
      setIsSponsorDialogOpen(false);
      setSponsorForm(defaultSponsorForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Update sponsor mutation
  const updateSponsor = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SponsorFormData }) => {
      const { error } = await db
        .from('sponsor_profiles')
        .update({
          company_name: data.company_name,
          company_logo: data.company_logo || null,
          description: data.description || null,
          website_url: data.website_url || null,
          contact_email: data.contact_email || null,
          is_verified: data.is_verified,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sponsors'] });
      toast.success('Sponsor updated!');
      setIsSponsorDialogOpen(false);
      setEditingSponsor(null);
      setSponsorForm(defaultSponsorForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Delete sponsor mutation
  const deleteSponsor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('sponsor_profiles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sponsors'] });
      toast.success('Sponsor deleted');
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Toggle sponsor verification
  const toggleVerified = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      const { error } = await db
        .from('sponsor_profiles')
        .update({ is_verified: verified })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sponsors'] });
    },
  });

  // Accept/reject collab
  const updateCollab = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (accept) {
        const { error } = await db
          .from('collab_posts')
          .update({ accepted_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await db.from('collab_posts').delete().eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-collab-posts'] });
      toast.success('Collab updated');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openEditSponsor = (sponsor: any) => {
    setEditingSponsor(sponsor);
    setSponsorForm({
      company_name: sponsor.company_name,
      company_logo: sponsor.company_logo || '',
      description: sponsor.description || '',
      website_url: sponsor.website_url || '',
      contact_email: sponsor.contact_email || '',
      is_verified: sponsor.is_verified || false,
    });
    setIsSponsorDialogOpen(true);
  };

  const openCreateSponsor = () => {
    setEditingSponsor(null);
    setSponsorForm(defaultSponsorForm);
    setIsSponsorDialogOpen(true);
  };

  const handleSponsorSubmit = () => {
    if (!sponsorForm.company_name) {
      toast.error('Company name is required');
      return;
    }
    
    if (editingSponsor) {
      updateSponsor.mutate({ id: editingSponsor.id, data: sponsorForm });
    } else {
      createSponsor.mutate(sponsorForm);
    }
  };

  const filteredSponsors = sponsors.filter((s: any) =>
    s.company_name.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCollabs = collabPosts.filter((c: any) => !c.accepted_at);
  const acceptedCollabs = collabPosts.filter((c: any) => c.accepted_at);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Handshake className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Collab & Sponsors</h2>
            <p className="text-sm text-muted-foreground">Manage partnerships and collaborations</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold">{sponsors.length}</span>
          </div>
          <p className="text-sm text-muted-foreground">Total Sponsors</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold">{sponsors.filter((s: any) => s.is_verified).length}</span>
          </div>
          <p className="text-sm text-muted-foreground">Verified</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold">{collabPosts.length}</span>
          </div>
          <p className="text-sm text-muted-foreground">Collab Posts</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold">
              {Object.values(sponsorAnalytics as Record<string, { views: number }>).reduce((acc, s) => acc + s.views, 0)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Sponsor Views</p>
        </GlassCard>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sponsors">Sponsors</TabsTrigger>
          <TabsTrigger value="collabs">
            Collabs
            {pendingCollabs.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingCollabs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Sponsors Tab */}
        <TabsContent value="sponsors" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sponsors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={openCreateSponsor} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Sponsor
            </Button>
          </div>

          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {sponsorsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : filteredSponsors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No sponsors found</div>
              ) : (
                filteredSponsors.map((sponsor: any) => {
                  const analytics = (sponsorAnalytics as Record<string, any>)[sponsor.id];
                  return (
                    <GlassCard key={sponsor.id} className="p-4">
                      <div className="flex items-center gap-4">
                        {sponsor.company_logo ? (
                          <img
                            src={sponsor.company_logo}
                            alt={sponsor.company_name}
                            className="h-12 w-12 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                            <Building2 className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{sponsor.company_name}</h3>
                            {sponsor.is_verified && (
                              <Badge className="bg-primary/20 text-primary">Verified</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {sponsor.description || 'No description'}
                          </p>
                          {analytics && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              <span>{analytics.views} views</span>
                              <span>{analytics.clicks} clicks</span>
                              <span>{analytics.rsvps} RSVPs</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleVerified.mutate({ id: sponsor.id, verified: !sponsor.is_verified })}
                            title={sponsor.is_verified ? 'Remove verification' : 'Verify'}
                          >
                            <CheckCircle className={`h-4 w-4 ${sponsor.is_verified ? 'fill-primary text-primary' : ''}`} />
                          </Button>
                          {sponsor.website_url && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => window.open(sponsor.website_url, '_blank')}
                              title="Visit website"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditSponsor(sponsor)}
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm('Delete this sponsor?')) {
                                deleteSponsor.mutate(sponsor.id);
                              }
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Collabs Tab */}
        <TabsContent value="collabs" className="space-y-4 mt-4">
          {pendingCollabs.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-destructive">Pending Approval ({pendingCollabs.length})</h3>
              {pendingCollabs.map((collab: any) => (
                <GlassCard key={collab.id} className="p-4 border-l-4 border-l-destructive">
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={collab.collaborator?.avatar_url} />
                      <AvatarFallback>{collab.collaborator?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        @{collab.collaborator?.username} wants to collab on post
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Role: {collab.role || 'Collaborator'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateCollab.mutate({ id: collab.id, accept: true })}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateCollab.mutate({ id: collab.id, accept: false })}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold">Active Collaborations ({acceptedCollabs.length})</h3>
            <ScrollArea className="h-[300px]">
              {acceptedCollabs.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No active collaborations</p>
              ) : (
                <div className="space-y-2">
                  {acceptedCollabs.map((collab: any) => (
                    <GlassCard key={collab.id} className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={collab.collaborator?.avatar_url} />
                          <AvatarFallback>{collab.collaborator?.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            @{collab.collaborator?.username}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Accepted {format(new Date(collab.accepted_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Badge variant="outline">{collab.role || 'Collaborator'}</Badge>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4 mt-4">
          <GlassCard className="p-4">
            <h3 className="font-semibold mb-4">Sponsor Performance</h3>
            <div className="space-y-3">
              {sponsors.map((sponsor: any) => {
                const stats = (sponsorAnalytics as Record<string, any>)[sponsor.id] || { views: 0, clicks: 0, rsvps: 0 };
                const ctr = stats.views > 0 ? ((stats.clicks / stats.views) * 100).toFixed(1) : '0';
                
                return (
                  <div key={sponsor.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                    {sponsor.company_logo ? (
                      <img src={sponsor.company_logo} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{sponsor.company_name}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="font-semibold">{stats.views}</p>
                        <p className="text-xs text-muted-foreground">Views</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold">{stats.clicks}</p>
                        <p className="text-xs text-muted-foreground">Clicks</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold">{ctr}%</p>
                        <p className="text-xs text-muted-foreground">CTR</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold">{stats.rsvps}</p>
                        <p className="text-xs text-muted-foreground">RSVPs</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {sponsors.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No sponsors to show analytics for</p>
              )}
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Sponsor Dialog */}
      <Dialog open={isSponsorDialogOpen} onOpenChange={setIsSponsorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSponsor ? 'Edit Sponsor' : 'Add Sponsor'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                value={sponsorForm.company_name}
                onChange={(e) => setSponsorForm(f => ({ ...f, company_name: e.target.value }))}
                placeholder="Company name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input
                value={sponsorForm.company_logo}
                onChange={(e) => setSponsorForm(f => ({ ...f, company_logo: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={sponsorForm.description}
                onChange={(e) => setSponsorForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description..."
                rows={2}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={sponsorForm.website_url}
                onChange={(e) => setSponsorForm(f => ({ ...f, website_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input
                type="email"
                value={sponsorForm.contact_email}
                onChange={(e) => setSponsorForm(f => ({ ...f, contact_email: e.target.value }))}
                placeholder="contact@company.com"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                checked={sponsorForm.is_verified}
                onCheckedChange={(c) => setSponsorForm(f => ({ ...f, is_verified: c }))}
              />
              <Label>Verified</Label>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsSponsorDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSponsorSubmit} disabled={createSponsor.isPending || updateSponsor.isPending}>
              {editingSponsor ? 'Save Changes' : 'Add Sponsor'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
