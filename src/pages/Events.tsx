import { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Calendar, Clock, MapPin, Users, Video, 
  Plus, Filter, ChevronRight, Check, Star
} from 'lucide-react';
import { format, isToday, isTomorrow, isThisWeek, isPast } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useEvents, useEventRSVP, VybeEvent } from '@/hooks/useEvents';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';

function formatEventDate(date: string) {
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  if (isThisWeek(d)) return format(d, 'EEEE');
  return format(d, 'MMM d');
}

const EventCard = memo(function EventCard({ 
  event,
  onRSVP,
}: { 
  event: VybeEvent;
  onRSVP: (status: 'going' | 'interested' | null) => void;
}) {
  const eventDate = new Date(event.start_time);
  const isPastEvent = isPast(eventDate);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card overflow-hidden"
    >
      {/* Cover Image */}
      <Link to={`/events/${event.id}`}>
        <div className="relative h-40 bg-gradient-to-br from-primary/20 to-accent/20">
          {event.cover_image ? (
            <img 
              src={event.cover_image} 
              alt={event.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Calendar className="h-12 w-12 text-primary/50" />
            </div>
          )}
          
          {/* Date Badge */}
          <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-center">
            <div className="text-xs text-muted-foreground uppercase">
              {format(eventDate, 'MMM')}
            </div>
            <div className="text-xl font-bold">
              {format(eventDate, 'd')}
            </div>
          </div>
          
          {/* Event Type Badge */}
          <Badge 
            className={cn(
              'absolute top-3 right-3',
              event.event_type === 'online' ? 'bg-blue-500' : 'bg-green-500'
            )}
          >
            {event.event_type === 'online' ? (
              <><Video className="h-3 w-3 mr-1" /> Online</>
            ) : (
              <><MapPin className="h-3 w-3 mr-1" /> In-Person</>
            )}
          </Badge>
          
          {isPastEvent && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Badge variant="secondary">Event Ended</Badge>
            </div>
          )}
        </div>
      </Link>
      
      {/* Content */}
      <div className="p-4">
        <Link to={`/events/${event.id}`}>
          <h3 className="font-semibold text-lg mb-1 hover:text-primary transition-colors">
            {event.title}
          </h3>
        </Link>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Clock className="h-4 w-4" />
          <span>{formatEventDate(event.start_time)} at {format(eventDate, 'h:mm a')}</span>
        </div>
        
        {event.location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="h-4 w-4" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
        
        {/* Host */}
        <Link 
          to={`/u/${event.host?.username}`}
          className="flex items-center gap-2 mb-4"
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={event.host?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">
              {event.host?.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm">Hosted by <strong>{event.host?.username}</strong></span>
        </Link>
        
        {/* RSVP & Attendees */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{event.rsvp_count} going</span>
          </div>
          
          {!isPastEvent && (
            <div className="flex gap-2">
              <Button
                variant={event.user_rsvp === 'interested' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  triggerHaptic('light');
                  onRSVP(event.user_rsvp === 'interested' ? null : 'interested');
                }}
              >
                <Star className={cn('h-4 w-4 mr-1', event.user_rsvp === 'interested' && 'fill-current')} />
                Interested
              </Button>
              <Button
                variant={event.user_rsvp === 'going' ? 'default' : 'secondary'}
                size="sm"
                className={cn(event.user_rsvp === 'going' && 'gradient-animated text-white')}
                onClick={() => {
                  triggerHaptic('medium');
                  onRSVP(event.user_rsvp === 'going' ? null : 'going');
                }}
              >
                <Check className="h-4 w-4 mr-1" />
                Going
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

export default function EventsPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'upcoming' | 'online' | 'local'>('upcoming');
  
  const filters = useMemo(() => ({
    upcoming: tab === 'upcoming' || tab === 'local',
    type: tab === 'online' ? 'online' as const : undefined,
  }), [tab]);
  
  const { data: events, isLoading } = useEvents(filters);
  const rsvpMutation = useEventRSVP();

  const handleRSVP = (eventId: string, status: 'going' | 'interested' | null) => {
    if (!profile) {
      toast.error('Please sign in to RSVP');
      return;
    }
    rsvpMutation.mutate({ eventId, status }, {
      onSuccess: () => {
        toast.success(status ? `Marked as ${status}!` : 'RSVP removed');
      },
    });
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              Events
            </h1>
            <p className="text-muted-foreground text-sm">
              Discover and join community events
            </p>
          </div>
          
          <Link to="/events/new">
            <Button className="gradient-animated text-white">
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </Button>
          </Link>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="online">Online</TabsTrigger>
            <TabsTrigger value="local">Local</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Events Grid */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        ) : events && events.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {events.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onRSVP={(status) => handleRSVP(event.id, status)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <EmptyState
            emoji="📅"
            title="No events found"
            description="Be the first to create an event for your community!"
            actionLabel="Create Event"
            onAction={() => window.location.href = '/events/new'}
          />
        )}
      </div>
    </AppLayout>
  );
}
