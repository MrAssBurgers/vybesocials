import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Calendar, Plus, Edit2, Trash2, Search, Users, Radio, 
  ExternalLink, Star, Eye, Clock, MapPin, Globe, Lock
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

interface EventFormData {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  location: string;
  online_link: string;
  event_type: 'in-person' | 'online';
  visibility: 'global' | 'community' | 'creator' | 'public';
  category: string;
  max_attendees: number | null;
  is_featured: boolean;
  is_public: boolean;
  cover_image: string;
  live_url: string;
  replay_url: string;
}

const defaultFormData: EventFormData = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  location: '',
  online_link: '',
  event_type: 'online',
  visibility: 'global',
  category: 'general',
  max_attendees: null,
  is_featured: false,
  is_public: true,
  cover_image: '',
  live_url: '',
  replay_url: '',
};

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'music', label: 'Music' },
  { value: 'art', label: 'Art' },
  { value: 'education', label: 'Education' },
  { value: 'social', label: 'Social' },
  { value: 'ama', label: 'AMA' },
  { value: 'launch', label: 'Launch' },
];

export function AdminEventsManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [formData, setFormData] = useState<EventFormData>(defaultFormData);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewRSVPsFor, setViewRSVPsFor] = useState<string | null>(null);

  // Fetch all events with host info
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['admin-events'],
    queryFn: async () => {
      const { data, error } = await db
        .from('events')
        .select(`
          *,
          host:profiles!host_id(id, username, avatar_url, display_name)
        `)
        .order('start_time', { ascending: false });
      
      if (error) throw error;
      
      // Get RSVP counts for each event
      const eventsWithCounts = await Promise.all(
        (data || []).map(async (event) => {
          const { count } = await db
            .from('event_rsvps')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .eq('status', 'going');
          
          return { ...event, rsvp_count: count || 0 };
        })
      );
      
      return eventsWithCounts;
    },
  });

  // Fetch RSVPs for a specific event
  const { data: eventRSVPs = [] } = useQuery({
    queryKey: ['event-rsvps', viewRSVPsFor],
    queryFn: async () => {
      if (!viewRSVPsFor) return [];
      
      const { data, error } = await db
        .from('event_rsvps')
        .select(`
          *,
          user:profiles!user_id(id, username, avatar_url, display_name)
        `)
        .eq('event_id', viewRSVPsFor)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewRSVPsFor,
  });

  // Create event mutation
  const createEvent = useMutation({
    mutationFn: async (data: EventFormData) => {
      const { data: session } = await db.auth.getSession();
      const { data: profile } = await db
        .from('profiles')
        .select('id')
        .eq('user_id', session.session?.user.id)
        .single();
      
      if (!profile) throw new Error('Profile not found');
      
      const { error } = await db.from('events').insert({
        ...data,
        host_id: profile.id,
        start_time: new Date(data.start_time).toISOString(),
        end_time: data.end_time ? new Date(data.end_time).toISOString() : null,
        max_attendees: data.max_attendees || null,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['global-events'] });
      toast.success('Event created!');
      setIsDialogOpen(false);
      setFormData(defaultFormData);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Update event mutation
  const updateEvent = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EventFormData }) => {
      const { error } = await db
        .from('events')
        .update({
          ...data,
          start_time: new Date(data.start_time).toISOString(),
          end_time: data.end_time ? new Date(data.end_time).toISOString() : null,
          max_attendees: data.max_attendees || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['global-events'] });
      toast.success('Event updated!');
      setIsDialogOpen(false);
      setEditingEvent(null);
      setFormData(defaultFormData);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Delete event mutation
  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      // First delete RSVPs
      await db.from('event_rsvps').delete().eq('event_id', id);
      // Then delete event
      const { error } = await db.from('events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['global-events'] });
      toast.success('Event deleted');
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Toggle featured mutation
  const toggleFeatured = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      const { error } = await db
        .from('events')
        .update({ is_featured: featured })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['global-banner-events'] });
    },
  });

  const openEditDialog = (event: any) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      start_time: event.start_time ? format(new Date(event.start_time), "yyyy-MM-dd'T'HH:mm") : '',
      end_time: event.end_time ? format(new Date(event.end_time), "yyyy-MM-dd'T'HH:mm") : '',
      location: event.location || '',
      online_link: event.online_link || '',
      event_type: event.event_type || 'online',
      visibility: event.visibility || 'global',
      category: event.category || 'general',
      max_attendees: event.max_attendees,
      is_featured: event.is_featured || false,
      is_public: event.is_public !== false,
      cover_image: event.cover_image || '',
      live_url: event.live_url || '',
      replay_url: event.replay_url || '',
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingEvent(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.start_time) {
      toast.error('Title and start time are required');
      return;
    }
    
    if (editingEvent) {
      updateEvent.mutate({ id: editingEvent.id, data: formData });
    } else {
      createEvent.mutate(formData);
    }
  };

  const filteredEvents = events.filter((e: any) =>
    e.title.toLowerCase().includes(search.toLowerCase())
  );

  const isEventLive = (event: any) => {
    const now = new Date();
    const start = new Date(event.start_time);
    const end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return now >= start && now <= end;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Events Management</h2>
            <p className="text-sm text-muted-foreground">Create and manage global events</p>
          </div>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Event
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold">{events.length}</span>
          </div>
          <p className="text-sm text-muted-foreground">Total Events</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            <span className="text-2xl font-bold">{events.filter((e: any) => e.is_featured).length}</span>
          </div>
          <p className="text-sm text-muted-foreground">Featured</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-red-500 animate-pulse" />
            <span className="text-2xl font-bold">{events.filter((e: any) => isEventLive(e)).length}</span>
          </div>
          <p className="text-sm text-muted-foreground">Live Now</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-500" />
            <span className="text-2xl font-bold">{events.reduce((acc: number, e: any) => acc + (e.rsvp_count || 0), 0)}</span>
          </div>
          <p className="text-sm text-muted-foreground">Total RSVPs</p>
        </GlassCard>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Events List */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading events...</div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No events found</div>
          ) : (
            filteredEvents.map((event: any) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <GlassCard className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Cover Image */}
                    {event.cover_image && (
                      <img
                        src={event.cover_image}
                        alt={event.title}
                        className="h-16 w-24 object-cover rounded-lg flex-shrink-0"
                      />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{event.title}</h3>
                        {isEventLive(event) && (
                          <Badge variant="destructive" className="gap-1">
                            <Radio className="h-3 w-3 animate-pulse" />
                            LIVE
                          </Badge>
                        )}
                        {event.is_featured && (
                          <Badge className="bg-yellow-500/20 text-yellow-500">
                            <Star className="h-3 w-3 mr-1" />
                            Featured
                          </Badge>
                        )}
                        <Badge variant="outline" className="capitalize">
                          {event.visibility}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(event.start_time), 'MMM d, h:mm a')}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {event.rsvp_count} RSVPs
                        </span>
                      </div>
                      
                      {/* Host info */}
                      <div className="flex items-center gap-2 mt-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={event.host?.avatar_url} />
                          <AvatarFallback>{event.host?.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                          @{event.host?.username}
                        </span>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setViewRSVPsFor(event.id)}
                        title="View RSVPs"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleFeatured.mutate({ id: event.id, featured: !event.is_featured })}
                        title={event.is_featured ? 'Remove from featured' : 'Add to featured'}
                      >
                        <Star className={`h-4 w-4 ${event.is_featured ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(event)}
                        title="Edit event"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm('Delete this event?')) {
                            deleteEvent.mutate(event.id);
                          }
                        }}
                        title="Delete event"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(f => ({ ...f, title: e.target.value }))}
                placeholder="Event title"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Event description..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <Input
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData(f => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="datetime-local"
                value={formData.end_time}
                onChange={(e) => setFormData(f => ({ ...f, end_time: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Event Type</Label>
              <Select
                value={formData.event_type}
                onValueChange={(v) => setFormData(f => ({ ...f, event_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="in-person">In-Person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={formData.visibility}
                onValueChange={(v) => setFormData(f => ({ ...f, visibility: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (Banner)</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="community">Community Only</SelectItem>
                  <SelectItem value="creator">Creator Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData(f => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Max Attendees</Label>
              <Input
                type="number"
                value={formData.max_attendees || ''}
                onChange={(e) => setFormData(f => ({ ...f, max_attendees: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="Unlimited"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Location (for in-person)</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData(f => ({ ...f, location: e.target.value }))}
                placeholder="Event location"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Online Link</Label>
              <Input
                value={formData.online_link}
                onChange={(e) => setFormData(f => ({ ...f, online_link: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Live URL</Label>
              <Input
                value={formData.live_url}
                onChange={(e) => setFormData(f => ({ ...f, live_url: e.target.value }))}
                placeholder="Stream URL"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Replay URL</Label>
              <Input
                value={formData.replay_url}
                onChange={(e) => setFormData(f => ({ ...f, replay_url: e.target.value }))}
                placeholder="Replay URL"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label>Cover Image URL</Label>
              <Input
                value={formData.cover_image}
                onChange={(e) => setFormData(f => ({ ...f, cover_image: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            
            <div className="flex items-center gap-4 md:col-span-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_featured}
                  onCheckedChange={(c) => setFormData(f => ({ ...f, is_featured: c }))}
                />
                <Label>Featured (show in banner)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_public}
                  onCheckedChange={(c) => setFormData(f => ({ ...f, is_public: c }))}
                />
                <Label>Public</Label>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createEvent.isPending || updateEvent.isPending}>
              {editingEvent ? 'Save Changes' : 'Create Event'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* RSVPs Dialog */}
      <Dialog open={!!viewRSVPsFor} onOpenChange={() => setViewRSVPsFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Event RSVPs ({eventRSVPs.length})</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {eventRSVPs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No RSVPs yet</p>
              ) : (
                eventRSVPs.map((rsvp: any) => (
                  <div key={rsvp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                    <Avatar>
                      <AvatarImage src={rsvp.user?.avatar_url} />
                      <AvatarFallback>{rsvp.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {rsvp.user?.display_name || rsvp.user?.username}
                      </p>
                      <p className="text-xs text-muted-foreground">@{rsvp.user?.username}</p>
                    </div>
                    <Badge variant={rsvp.status === 'going' ? 'default' : 'secondary'}>
                      {rsvp.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
