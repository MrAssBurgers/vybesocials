import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, isPast } from 'date-fns';
import { ArrowLeft, Calendar, Check, Clock, MapPin, Share2, Star, Users, Video } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { EventReminderButton } from '@/components/events/EventReminderButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useEvent, useEventAttendees, useEventRSVP } from '@/hooks/useEvents';
import { toast } from 'sonner';

export default function EventDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: event, isLoading, isError } = useEvent(id);
  const { data: attendees = [] } = useEventAttendees(id);
  const rsvpMutation = useEventRSVP();

  const rsvp = (status: 'going' | 'interested' | null) => {
    if (!profile) {
      toast.error('Please sign in to RSVP');
      return;
    }
    triggerHaptic(status === 'going' ? 'medium' : 'light');
    rsvpMutation.mutate(
      { eventId: id, status },
      { onSuccess: () => toast.success(status ? `Marked as ${status}` : 'RSVP removed') },
    );
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: event?.title || 'VYBE event', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Event link copied');
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/events')} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Events
        </Button>

        {isLoading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : isError || !event ? (
          <EmptyState
            emoji="📅"
            title="Event not found"
            description="This event may have been removed, or the link is incomplete."
            actionLabel="Back to events"
            onAction={() => navigate('/events')}
          />
        ) : (
          <article className="liquid-glass-card overflow-hidden rounded-2xl">
            <div className="relative h-56 bg-gradient-to-br from-primary/25 to-accent/20">
              {event.cover_image ? (
                <img src={event.cover_image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Calendar className="h-14 w-14 text-primary/50" />
                </div>
              )}
              <Badge className={cn('absolute right-3 top-3', event.event_type === 'online' ? 'bg-blue-500' : 'bg-green-500')}>
                {event.event_type === 'online' ? <Video className="mr-1 h-3 w-3" /> : <MapPin className="mr-1 h-3 w-3" />}
                {event.event_type === 'online' ? 'Online' : 'In person'}
              </Badge>
              {isPast(new Date(event.start_time)) && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Badge variant="secondary">Event ended</Badge>
                </div>
              )}
            </div>

            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
                <Button type="button" variant="outline" size="icon" aria-label="Share event" onClick={() => void share()}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0" />
                  {format(new Date(event.start_time), 'EEEE, MMM d · h:mm a')}
                  {event.end_time ? ` – ${format(new Date(event.end_time), 'h:mm a')}` : ''}
                </p>
                {event.location && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {event.location}
                  </p>
                )}
                {event.online_link && (
                  <a href={event.online_link} className="flex items-center gap-2 text-primary hover:underline" target="_blank" rel="noreferrer">
                    <Video className="h-4 w-4 shrink-0" />
                    Join online
                  </a>
                )}
              </div>

              {event.host?.username && (
                <Link to={`/u/${event.host.username}`} className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={event.host.avatar_url || undefined} alt="" />
                    <AvatarFallback>{event.host.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">Hosted by <strong>{event.host.username}</strong></span>
                </Link>
              )}

              {event.description && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{event.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {event.rsvp_count || 0} going
                </span>
                {!isPast(new Date(event.start_time)) && (
                  <>
                    <EventReminderButton eventId={event.id} eventStartTime={event.start_time} />
                    <Button
                      variant={event.user_rsvp === 'interested' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => rsvp(event.user_rsvp === 'interested' ? null : 'interested')}
                    >
                      <Star className={cn('mr-1 h-4 w-4', event.user_rsvp === 'interested' && 'fill-current')} />
                      Interested
                    </Button>
                    <Button
                      variant={event.user_rsvp === 'going' ? 'default' : 'secondary'}
                      size="sm"
                      className={cn(event.user_rsvp === 'going' && 'gradient-animated text-white')}
                      onClick={() => rsvp(event.user_rsvp === 'going' ? null : 'going')}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Going
                    </Button>
                  </>
                )}
              </div>

              {attendees.length > 0 && (
                <section aria-label="People going">
                  <h2 className="mb-2 text-sm font-semibold">Who's in</h2>
                  <ul className="flex flex-wrap gap-2">
                    {attendees.map((row) => (
                      <li key={row.id}>
                        <Link to={row.user?.username ? `/u/${row.user.username}` : '/events'} className="flex items-center gap-2 rounded-full border border-border bg-background/40 px-2 py-1 text-xs">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={row.user?.avatar_url || undefined} alt="" />
                            <AvatarFallback>{row.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {row.user?.username || 'Member'}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </article>
        )}
      </div>
    </AppLayout>
  );
}
